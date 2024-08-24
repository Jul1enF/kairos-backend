const request = require('supertest');
const app = require('./app');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/users');

// Config d'une co MongoDB avant les tests
beforeAll(async () => {
    await mongoose.connect(process.env.CONNECTION_STRING, { useNewUrlParser: true, useUnifiedTopology: true });
});

// Test de la route /users/signin avec infos correct
it('POST /users/signin - user found', async () => {
    const password = 'azerty123';
    const user = new User({
        firstname: 'test',
        name: 'test',
        email: 'test@gmail.com',
        password: bcrypt.hashSync(password, 10), 
        token: 'token',
        skills: [{ legalScore: 50, commerceScore: 50 }],
        verified: true,
    });
    await user.save(); // Sauvegarde du user test créé dans la bdd

    console.log("Test user created"); 

    
    const res = await request(app).post('/users/signin').send({
        email: 'test@gmail.com',
        password: password,
    });

    // Vérif
    expect(res.statusCode).toBe(200);
    expect(res.body.result).toBe(true);
    expect(res.body.user).toHaveProperty('firstname', 'test');

    console.log("Test user signin successful"); 

    // Suppression de l'utilisateur de la base après test
    await User.deleteOne({ email: 'test@gmail.com' });

    console.log("Test user deleted"); 
});

// Test de la route /users/signin avec infos incorrect
it('POST /users/signin - user not found', async () => {
    const res = await request(app).post('/users/signin').send({
        email: 'invalid@gmail.com',
        password: 'wrongpassword',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.result).toBe(false);
    expect(res.body.error).toBe('User not found');
});

// Fermeture de la co à MongoDB après les tests
afterAll(done => {
    mongoose.connection.close();
    done();
});
