const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/users');
const URL_BACK = process.env.URL_BACK;


//config passeport pour la strategie google
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  //redirection apres auth reussi
  callbackURL: `${URL_BACK}/users/auth/google/callback`
}, (accessToken, refreshToken, profile, done) => {
  User.findOne({ email: profile.emails[0].value })
  .then(user => {
    //connexion et ajout user dans bdd si pas encore
    if (user) {
      return done(null, user);
    } else {
      const newUser = new User({
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value
      });
      newUser.save().then(user => done(null, user))
      .catch(err => done(err));
    }
  })
}
));
//serialiser le user
passport.serializeUser((user, done) => {
  done(null, user.id);
});
//comment recup user
passport.deserializeUser((id, done) => {
  User.findById(id)
    .then(user => done(null, user)) // Désérialisation de l'utilisateur à partir de l'id
    .catch(err => done(err));
});

module.exports = passport;
