const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

(async () => {
    try {
        console.log('=== Create Admin User ===\n');
        
        const choice = await question('Would you like to:\n1. Make an existing user an admin\n2. Create a new admin user\nEnter choice (1 or 2): ');
        
        const db = await open({
            filename: path.join(__dirname, 'shopping.sqlite'),
            driver: sqlite3.Database
        });
        
        if (choice === '1') {
            // Make existing user admin
            const username = await question('Enter username to make admin: ');
            
            const user = await db.get('SELECT * FROM users WHERE username = ?', username);
            
            if (!user) {
                console.log('❌ User not found!');
                rl.close();
                await db.close();
                return;
            }
            
            if (user.role === 'A') {
                console.log('⚠️  User is already an admin!');
            } else {
                await db.run('UPDATE users SET role = ? WHERE username = ?', 'A', username);
                console.log(`✅ User "${username}" is now an admin!`);
            }
            
        } else if (choice === '2') {
            // Create new admin user
            const username = await question('Enter username: ');
            const password = await question('Enter password: ');
            
            // Check if user exists
            const existing = await db.get('SELECT * FROM users WHERE username = ?', username);
            if (existing) {
                console.log('❌ Username already exists!');
                rl.close();
                await db.close();
                return;
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Insert admin user
            await db.run(
                'INSERT INTO users (username, password, role, description) VALUES (?, ?, ?, ?)',
                username,
                hashedPassword,
                'A',
                'System Administrator'
            );
            
            console.log(`✅ Admin user "${username}" created successfully!`);
            
        } else {
            console.log('❌ Invalid choice!');
        }
        
        rl.close();
        await db.close();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        rl.close();
    }
})();
