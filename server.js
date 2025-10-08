const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const PORT = 8080;
const static_dir = path.join(__dirname, 'static');
const app = express();


const bcrypt = require('bcryptjs');
const session = require('express-session');
app.use(session({secret: 'superSecret', resave: false, saveUninitialized: false}));

// Configure file upload for verification documents
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads', 'verification');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only images (JPEG, PNG) and PDFs are allowed'));
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});



app.use(express.static(static_dir));
app.use('/uploads', express.static('uploads')); // Serve uploaded files
app.use(express.urlencoded({extended: false}));
app.set('view engine', 'ejs');



// New import stuff from the other file
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Start the database
let db;
(async () => {
    db = await open({
        filename: 'shopping.sqlite',
        driver: sqlite3.Database
    });

})();

app.get('/', async (req, res) => {
    res.render("home")
});

app.get('/providerReg', async (req, res)=> {
    res.render("registerprovider")
});

app.get('/userRegister', async (req, res)=> {
    res.render("registercustomer")
});


app.post('/providerReg', async (req, res)=>{
    let name = req.body.username;
    let password = req.body.password;
    console.log(name);
    console.log(password);
    const hashpass = await bcrypt.hash(password, 10);

    await db.run(`INSERT INTO USERS (username, password, role) VALUES (?, ?, ?)`, 
        [name, hashpass, "P"]
    ); 
    res.redirect('/');

});

app.post('/regUser', async (req, res) =>{
    let name = req.body.username;
    let password = req.body.password;
    console.log(name);
    console.log(password);
    const hashpass = await bcrypt.hash(password, 10);

    await db.run(`INSERT INTO USERS (username, password, role) VALUES (?, ?, ?)`, 
        [name, hashpass, "C"]
    ); 
    res.redirect('/');
})


app.get("/login", async (req, res)=>{
    res.render("login");
})

app.post("/login", async (req, res) => {
  let errors = []
  let username = req.body.username;
  let password = req.body.password;
  // console.log("Username:", username, "Password:", password);

  // get the data from the databse
  const data = await db.get(`SELECT * FROM users WHERE username = ?`, [username])
  // console.log(data);

  if(!data){
    console.log("data not found in the database")
    errors.push("User data could not be found. Try making an account.")
    return res.render("home", {errors: errors})
  }
    // compare the encrypted password with the other password
    const compare = await bcrypt.compare(password, data.password)
  
    // if the comparison is true, send them to the dashboard
    if(compare){
      console.log("login worked")
      req.session.user = data;
      res.redirect("/dashboard")
    } 
    
    else {
      errors.push("Incorrect password. Try again.")
      return res.render("login", {errors: errors})
    }
  
});

app.get("/dashboard", async (req, res)=>{
    if(!req.session.user){
        return res.redirect("/");
    } else {
        const user = req.session.user;
        const role = req.session.role;
        console.log(user);
        res.render("dashboard", {user: user, role: role})
    }
})

app.post("/update-description", async (req,res)=>{
    if(!req.session.user){
        return res.redirect("/");
    } else {
        const description = req.body.description;
        const sessionUser = req.session.user;
        const uid = sessionUser.user_id || sessionUser.id || sessionUser.userId;
        if (!uid) return res.redirect('/');
        await db.run('UPDATE users SET description = ? WHERE id = ?', [description, uid]);
        // reload updated user and store in session
        const updated = await db.get('SELECT * FROM users WHERE id = ?', [uid]);
        req.session.user = updated;
        return res.redirect('/dashboard');
    }
})


app.get("/providers", async (req,res)=>{
    if(!req.session.user){
        return res.redirect("/");
    } else {
        // Get all providers
        let providers = await db.all("SELECT * FROM users WHERE role = ?", ["P"]);
        for (let provider of providers) {
            const ratingData = await db.get(
                "SELECT AVG(rating) as avgRating, COUNT(*) as totalReviews FROM reviews WHERE provider_id = ?",
                [provider.id]
            );
            provider.avgRating = ratingData.avgRating ? parseFloat(ratingData.avgRating).toFixed(1) : null;
            provider.totalReviews = ratingData.totalReviews || 0;
        }
        
        return res.render('providers', {
            provider: providers,
            user: req.session.user
        })
    }
})

// Provider detail page with reviews
app.get("/providers/:id", async (req,res)=>{
    if(!req.session.user){
        return res.redirect("/");
    }
    const providerId = req.params.id;
    
    // Get provider details
    const provider = await db.get("SELECT * FROM users WHERE id = ? AND role = ?", [providerId, "P"]);
    if (!provider) {
        return res.status(404).send('Provider not found');
    }
    
    // Get all reviews for this provider
    const reviews = await db.all(`
        SELECT r.*, u.username as reviewer_name 
        FROM reviews r 
        JOIN users u ON r.reviewer_id = u.id 
        WHERE r.provider_id = ? 
        ORDER BY r.created_at DESC
    `, [providerId]);
    
    // Calculate average rating
    const ratingResult = await db.get("SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews FROM reviews WHERE provider_id = ?", [providerId]);
    const avgRating = ratingResult.avg_rating ? parseFloat(ratingResult.avg_rating).toFixed(1) : null;
    const totalReviews = ratingResult.total_reviews || 0;
    
    // Check if current user already reviewed this provider
    const currentUserId = req.session.user.id;
    const existingReview = await db.get("SELECT * FROM reviews WHERE provider_id = ? AND reviewer_id = ?", [providerId, currentUserId]);
    
    return res.render('provider_detail', {
        provider: provider,
        reviews: reviews,
        avgRating: avgRating,
        totalReviews: totalReviews,
        currentUser: req.session.user,
        hasReviewed: !!existingReview
    });
});

// Submit a review for a provider
app.post("/providers/:id/review", async (req,res)=>{
    if(!req.session.user){
        return res.redirect("/");
    }
    
    const providerId = req.params.id;
    const reviewerId = req.session.user.id;
    const { rating, comment } = req.body;
    
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).send('Rating must be between 1 and 5');
    }
    
    // Check if user already reviewed this provider
    const existing = await db.get("SELECT * FROM reviews WHERE provider_id = ? AND reviewer_id = ?", [providerId, reviewerId]);
    
    if (existing) {
        // Update existing review
        await db.run(
            "UPDATE reviews SET rating = ?, comment = ?, created_at = datetime('now') WHERE id = ?",
            [rating, comment || '', existing.id]
        );
    } else {
        // Insert new review
        await db.run(
            "INSERT INTO reviews (provider_id, reviewer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
            [providerId, reviewerId, rating, comment || '']
        );
    }
    
    return res.redirect(`/providers/${providerId}`);
});

// ============================================
// VERIFICATION / BACKGROUND CHECK ROUTES
// ============================================

// Provider: View verification status and submit documents
app.get('/verification/submit', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'P') {
        return res.redirect('/');
    }
    
    // Check if already verified or pending
    const existing = await db.get(
        'SELECT * FROM background_checks WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1',
        [req.session.user.id]
    );
    
    const documents = await db.all(
        'SELECT * FROM verification_documents WHERE user_id = ? ORDER BY uploaded_at DESC',
        [req.session.user.id]
    );
    
    res.render('verification_submit', { 
        user: req.session.user,
        existingCheck: existing,
        documents: documents
    });
});

// Provider: Submit verification with documents
app.post('/verification/submit', upload.array('documents', 5), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'P') {
        return res.redirect('/');
    }
    
    const userId = req.session.user.id;
    
    try {
        // Check if already has a pending verification
        const existing = await db.get(
            'SELECT * FROM background_checks WHERE user_id = ? AND status = ?',
            [userId, 'pending']
        );
        
        if (existing) {
            return res.redirect('/verification/submit?error=already_pending');
        }
        
        // Create background check record
        await db.run(
            'INSERT INTO background_checks (user_id, status) VALUES (?, ?)',
            [userId, 'pending']
        );
        
        // Save uploaded documents
        if (req.files && req.files.length > 0) {
            const documentTypes = Array.isArray(req.body.document_types) 
                ? req.body.document_types 
                : [req.body.document_types];
            
            for (let i = 0; i < req.files.length; i++) {
                await db.run(
                    'INSERT INTO verification_documents (user_id, document_type, file_path) VALUES (?, ?, ?)',
                    [userId, documentTypes[i] || 'other', req.files[i].filename]
                );
            }
        }
        
        res.redirect('/verification/submit?success=submitted');
    } catch (error) {
        console.error('Verification submission error:', error);
        res.status(500).send('Error submitting verification');
    }
});

// Admin: View all pending verifications
app.get('/admin/verifications', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'A') {
        return res.redirect('/');
    }
    
    const pending = await db.all(`
        SELECT bc.*, u.username, u.id as user_id, u.description
        FROM background_checks bc
        JOIN users u ON bc.user_id = u.id
        WHERE bc.status = 'pending'
        ORDER BY bc.submitted_at ASC
    `);
    
    const approved = await db.all(`
        SELECT bc.*, u.username, u.id as user_id
        FROM background_checks bc
        JOIN users u ON bc.user_id = u.id
        WHERE bc.status = 'approved'
        ORDER BY bc.reviewed_at DESC
        LIMIT 10
    `);
    
    const rejected = await db.all(`
        SELECT bc.*, u.username, u.id as user_id
        FROM background_checks bc
        JOIN users u ON bc.user_id = u.id
        WHERE bc.status = 'rejected'
        ORDER BY bc.reviewed_at DESC
        LIMIT 10
    `);
    
    res.render('admin_verifications', { 
        pending: pending,
        approved: approved,
        rejected: rejected,
        user: req.session.user
    });
});

// Admin: Review specific verification
app.get('/admin/verifications/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'A') {
        return res.redirect('/');
    }
    
    const checkId = req.params.id;
    const check = await db.get(`
        SELECT bc.*, u.username, u.id as user_id, u.description, u.role
        FROM background_checks bc
        JOIN users u ON bc.user_id = u.id
        WHERE bc.id = ?
    `, [checkId]);
    
    if (!check) {
        return res.status(404).send('Verification not found');
    }
    
    const documents = await db.all(
        'SELECT * FROM verification_documents WHERE user_id = ? ORDER BY uploaded_at DESC',
        [check.user_id]
    );
    
    res.render('admin_verification_review', { 
        check: check,
        documents: documents,
        user: req.session.user
    });
});

// Admin: Approve or reject verification
app.post('/admin/verifications/:id/decide', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'A') {
        return res.redirect('/');
    }
    
    const checkId = req.params.id;
    const { decision, notes } = req.body;
    const adminId = req.session.user.id;
    
    if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).send('Invalid decision');
    }
    
    const check = await db.get('SELECT * FROM background_checks WHERE id = ?', [checkId]);
    
    if (!check) {
        return res.status(404).send('Verification not found');
    }
    
    await db.run(
        `UPDATE background_checks 
         SET status = ?, reviewed_at = datetime('now'), reviewed_by = ?, notes = ?
         WHERE id = ?`,
        [decision, adminId, notes || '', checkId]
    );
    
    // If approved, update user verification status
    if (decision === 'approved') {
        await db.run(
            `UPDATE users 
             SET is_verified = 1, verified_at = datetime('now')
             WHERE id = ?`,
            [check.user_id]
        );
    } else {
        // If rejected, clear verification status
        await db.run(
            `UPDATE users 
             SET is_verified = 0, verified_at = NULL
             WHERE id = ?`,
            [check.user_id]
        );
    }
    
    res.redirect('/admin/verifications?message=Verification updated');
});

// ========================================
// JOB BOOKING ROUTES
// ========================================

// GET /providers/:id/book - Show booking form (Customers only)
app.get('/providers/:id/book', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    
    if (req.session.user.role !== 'C') {
        return res.status(403).send('Only customers can book services');
    }
    
    // const db = await  ;
    const provider = await db.get(
        `SELECT id, username, description, is_verified 
         FROM users 
         WHERE id = ? AND role = 'P'`,
        [req.params.id]
    );
    
    if (!provider) {
        return res.status(404).send('Provider not found');
    }
    
    res.render('book_job', { 
        provider: provider,
        user: req.session.user
    });
});

// POST /providers/:id/book - Create job booking (Customers only)
app.post('/providers/:id/book', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'C') {
        return res.redirect('/');
    }
    
    const { service_description, service_category, scheduled_date, scheduled_time, address, customer_notes, price } = req.body;
    
    if (!service_description || !scheduled_date || !address) {
        return res.status(400).send('Service description, date, and address are required');
    }
    
    // const db = await  ;
    
    // Verify provider exists
    const provider = await db.get('SELECT id FROM users WHERE id = ? AND role = "P"', [req.params.id]);
    if (!provider) {
        return res.status(404).send('Provider not found');
    }
    
    // Create job
    const result = await db.run(
        `INSERT INTO jobs (customer_id, provider_id, service_description, service_category, scheduled_date, scheduled_time, address, customer_notes, price, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [req.session.user.id, req.params.id, service_description, service_category || null, scheduled_date, scheduled_time || null, address, customer_notes || null, price || null]
    );
    
    res.redirect(`/jobs/${result.lastID}?message=Booking request sent!`);
});

// GET /jobs - View all jobs (filtered by role)
app.get('/jobs', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    
    const user = req.session.user;
    
    let jobs;
    if (user.role === 'C') {
        // Customers see jobs they've booked
        jobs = await db.all(
            `SELECT 
                j.*,
                p.username as provider_name,
                p.is_verified as provider_verified
             FROM jobs j
             JOIN users p ON j.provider_id = p.id
             WHERE j.customer_id = ?
             ORDER BY j.created_at DESC`,
            [user.id]
        );
    } else if (user.role === 'P') {
        // Providers see jobs assigned to them
        jobs = await db.all(
            `SELECT 
                j.*,
                c.username as customer_name
             FROM jobs j
             JOIN users c ON j.customer_id = c.id
             WHERE j.provider_id = ?
             ORDER BY j.created_at DESC`,
            [user.id]
        );
    } else if (user.role === 'A') {
        // Admins see all jobs
        jobs = await db.all(
            `SELECT 
                j.*,
                c.username as customer_name,
                p.username as provider_name,
                p.is_verified as provider_verified
             FROM jobs j
             JOIN users c ON j.customer_id = c.id
             JOIN users p ON j.provider_id = p.id
             ORDER BY j.created_at DESC`
        );
    }
    
    res.render('jobs', { 
        jobs: jobs,
        user: user
    });
});

// GET /jobs/:id - View job details
app.get('/jobs/:id', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    
    const job = await db.get(
        `SELECT 
            j.*,
            c.username as customer_name,
            p.username as provider_name,
            p.is_verified as provider_verified,
            p.description as provider_description
         FROM jobs j
         JOIN users c ON j.customer_id = c.id
         JOIN users p ON j.provider_id = p.id
         WHERE j.id = ?`,
        [req.params.id]
    );
    
    if (!job) {
        return res.status(404).send('Job not found');
    }
    
    // Check if user has access to this job
    const user = req.session.user;
    if (user.role !== 'A' && job.customer_id !== user.id && job.provider_id !== user.id) {
        return res.status(403).send('Access denied');
    }
    
    res.render('job_detail', { 
        job: job,
        user: user,
        message: req.query.message || null
    });
});

// POST /jobs/:id/accept - Provider accepts job
app.post('/jobs/:id/accept', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'P') {
        return res.status(403).send('Only providers can accept jobs');
    }
    
    // const db = await  ;
    const job = await db.get('SELECT * FROM jobs WHERE id = ? AND provider_id = ?', [req.params.id, req.session.user.id]);
    
    if (!job) {
        return res.status(404).send('Job not found or not assigned to you');
    }
    
    if (job.status !== 'pending') {
        return res.status(400).send('Job is not in pending status');
    }
    
    await db.run(
        `UPDATE jobs 
         SET status = 'accepted', accepted_at = datetime('now')
         WHERE id = ?`,
        [req.params.id]
    );
    
    res.redirect(`/jobs/${req.params.id}?message=Job accepted!`);
});

// POST /jobs/:id/decline - Provider declines job
app.post('/jobs/:id/decline', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'P') {
        return res.status(403).send('Only providers can decline jobs');
    }
    
    // const db = await  ;
    const job = await db.get('SELECT * FROM jobs WHERE id = ? AND provider_id = ?', [req.params.id, req.session.user.id]);
    
    if (!job) {
        return res.status(404).send('Job not found or not assigned to you');
    }
    
    if (job.status !== 'pending') {
        return res.status(400).send('Job is not in pending status');
    }
    
    await db.run(
        `UPDATE jobs 
         SET status = 'declined'
         WHERE id = ?`,
        [req.params.id]
    );
    
    res.redirect(`/jobs?message=Job declined`);
});

// POST /jobs/:id/start - Provider starts job
app.post('/jobs/:id/start', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'P') {
        return res.status(403).send('Only providers can start jobs');
    }
    
    // const db = await  ;
    const job = await db.get('SELECT * FROM jobs WHERE id = ? AND provider_id = ?', [req.params.id, req.session.user.id]);
    
    if (!job) {
        return res.status(404).send('Job not found');
    }
    
    if (job.status !== 'accepted') {
        return res.status(400).send('Job must be accepted first');
    }
    
    await db.run(
        `UPDATE jobs 
         SET status = 'in_progress'
         WHERE id = ?`,
        [req.params.id]
    );
    
    res.redirect(`/jobs/${req.params.id}?message=Job started!`);
});

// POST /jobs/:id/complete - Provider marks job as complete
app.post('/jobs/:id/complete', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'P') {
        return res.status(403).send('Only providers can complete jobs');
    }
    
    const { provider_notes } = req.body;
    
    // const db = await  ;
    const job = await db.get('SELECT * FROM jobs WHERE id = ? AND provider_id = ?', [req.params.id, req.session.user.id]);
    
    if (!job) {
        return res.status(404).send('Job not found');
    }
    
    if (job.status !== 'in_progress' && job.status !== 'accepted') {
        return res.status(400).send('Job must be in progress or accepted');
    }
    
    await db.run(
        `UPDATE jobs 
         SET status = 'completed', completed_at = datetime('now'), provider_notes = ?
         WHERE id = ?`,
        [provider_notes || null, req.params.id]
    );
    
    res.redirect(`/jobs/${req.params.id}?message=Job completed!`);
});

// POST /jobs/:id/cancel - Customer or Provider cancels job
app.post('/jobs/:id/cancel', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    
    // const db = await  ;
    const job = await db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    
    if (!job) {
        return res.status(404).send('Job not found');
    }
    
    // Only customer or provider can cancel
    if (job.customer_id !== req.session.user.id && job.provider_id !== req.session.user.id) {
        return res.status(403).send('Access denied');
    }
    
    // Can't cancel completed jobs
    if (job.status === 'completed') {
        return res.status(400).send('Cannot cancel completed jobs');
    }
    
    await db.run(
        `UPDATE jobs 
         SET status = 'cancelled'
         WHERE id = ?`,
        [req.params.id]
    );
    
    res.redirect(`/jobs?message=Job cancelled`);
});


app.get("/logout", (req, res) => {
  delete req.session.user;
  return res.redirect("/");
})

app.listen(PORT, () => console.log(`Server is ready on port ${PORT}`));