var express = require('express');
var router = express.Router();
const uid2 = require('uid2');
const bcrypt = require('bcrypt');
const passport = require('../config/auth');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const { OAuth2Client } = require('google-auth-library')

const User = require('../models/users');
const { checkBody } = require('../modules/checkBody');

const ourEmail = process.env.EMAIL;
const ourPassword = process.env.EMAIL_PASSWORD
const urlFront = process.env.URL_FRONT  //3001
const urlBack = process.env.URL_BACK  //3000
const emailSecret = process.env.EMAIL_SECRET
const {JWT_SECRET} = process.env

const mongoose = require('mongoose');

const connectionString = process.env.CONNECTION_STRING;


// ROUTE SIGNUP AVEC VERIFICATION MAIL
router.post('/signup', async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	if (!checkBody(req.body, ['email', 'password', 'firstname', 'name'])) {
    res.json({ result: false, error: 'Missing or empty fields' });
    return;
  }

  // Check if the user has not already been registered
  User.findOne({ email: req.body.email }).then(data => {
    if (data === null) {
      const hash = bcrypt.hashSync(req.body.password, 10);
      const newUser = new User({
        firstname: req.body.firstname,
        name: req.body.name,
        email: req.body.email,
        password: hash,
        skills: [],
        last_connection: new Date(),
        searches: [],
        verified: false,
      });

      newUser.save().then(data => {

         // SETUP COMPTE ENVOI DES MAILS CONFIRMATION
      const transporter = nodemailer.createTransport({
        service: "Gmail",
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: ourEmail,
          pass: ourPassword,
        },
      });

        // SETUP TOKEN A ENVOYER AU USER
      const emailToken = jwt.sign({
        userId: data._id
    }, emailSecret, { expiresIn: '1h' });

    console.log(emailToken)
    // URL ROUTE GET POUR CONFIRMER MAIL
    const url = `${urlBack}/users/confirmation/${emailToken}`
    console.log(url)
    // MAIL ENVOYE
    const mailOptions = {
      from: ourEmail,
      to: newUser.email,
      subject: "KAIROS - Confirmation",
      html: `
      <body style="margin: 0; padding: 0;color:#163050;">
        <div style="height: 50%; display: flex; flex-direction: column; margin: 0;padding: 5%;height: 100%;background: linear-gradient(to bottom, #F8E9A9, #ffffff)">
          <h1 style="font-family:Calibri; align-self: center; border-bottom: 1px solid #163050">
          Kairos
          </h1>

          <h2>Bienvenue ${newUser.firstname} !</h2>

          <h4 style="font-family:Calibri;">
          Pour finaliser votre inscription et accéder à tous nos services, merci de cliquer sur ce lien : <a href =${url}>confirmer votre adresse mail</a>
          </h4>

          <h5 style="font-family:Calibri;">
          À bientôt sur Kairos !
          </h5>
        </div>
      </body>`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email: ", error);
        res.status(500).json({ result: false, error: 'Failed to send confirmation email' });
      } else {
        console.log("Email sent: ", info.response);
        const user = {
          firstname: data.firstname,
          name: data.name,
          email: data.email,
          skills: data.skills,
          last_connection: data.last_connection,
          searches: data.searches,
          verified: false,
        }
    
        res.json({ result: true, user});
      }
    })
  })
    } else {
      // User already exists in database
      res.json({ result: false, error: 'User already exists' });
    }
  });
});

//ROUTE CONFIRMATION EMAIL
router.get('/confirmation/:token', async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	
  // Récupérer l'ID du User avec jwt
  const user = jwt.verify(req.params.token, emailSecret);
  const userId = user.userId;
  console.log(userId)

  // Modifier le champ verified du document User
  User.updateOne({_id: userId}, {verified: true})
  .then((data) => {
    // Si Update n'a pas modifié de document
  if (data.modifiedCount === 0) {
      User.findById(userId).then(user => {
        if (user) {
          res.json({result: false, error: 'Email already verified'})
        }
      })
    } 

    User.findById(userId)
    .then(data => {
      if (data.verified === true) {
        const token = uid2(32);
        User.updateOne({_id: userId},{token: token})
        .then(
        res.redirect(`${urlFront}/mail-confirm`)
      )}
      else {
        res.json({result: false, error: 'Email not verified'})
        } 
    })
    
  })
  
})

// ROUTE SIGNIN
router.post('/signin', async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	
  if (!checkBody(req.body, ['email', 'password'])) {
    res.json({ result: false, error: 'Missing or empty fields' });
    return;
  }

  User.findOne({ email: req.body.email})
  .then(data => {
    if (data && bcrypt.compareSync(req.body.password, data.password) && data.verified) {
      const user = {
        firstname: data.firstname,
        name: data.name,
        email: data.email,
        token: data.token,
        skills : data.skills,
      }
      res.json({ result: true, user });
    } else {
      res.json({ result: false, error: 'User not found' });
    }
  });

});








// NOUVELLE ROUTE CONNEXION GOOGLE

// 1ère route pour avoir une url de connexion google

const googleId = process.env.CLIENT_ID
const googleSecret = process.env.CLIENT_SECRET

router.post('/google', async (req, res) => {
  try {
      res.header('Access-Control-Allow-Origin', `${urlFront}`)

      // Pour autoriser l'utilisation de http ou lieu de https
      res.header('Referrer-Policy', 'no-referrer-when-downgrade')

      const redirectUrl = `${urlBack}/users/google/auth`

      const oAuth2Client = new OAuth2Client(
          googleId,
          googleSecret,
          redirectUrl,
      )

      const authorizeUrl = oAuth2Client.generateAuthUrl({

          // Pour avoir un nouveau token à chaque fois
          access_type: 'offline',
          // Scope des infos que l'on veut récupérer
          scope: 'https://www.googleapis.com/auth/userinfo.profile openid email',
          // Pour redemander quelle session google l'utilisateur veut utiliser à chacune de ses connexions
          prompt: 'consent',
      })

      res.json({ url: authorizeUrl })
  } catch (err) { res.json({ err }) }
})



// redirectUrl : Route pour obtenir de Google les infos du user

router.get('/google/auth', async (req, res) => {
  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

  //Récupération du code fourni par google
  const { code } = req.query

  try {
      const redirectUrl = `${urlBack}/users/google/auth`
      const oAuth2Client = new OAuth2Client(
          googleId,
          googleSecret,
          redirectUrl,
      )

      //Échange du code contre un token d'utilisation
      const answer = await oAuth2Client.getToken(code)
      await oAuth2Client.setCredentials(answer.tokens)

      //Récupération des infos/credentials/tokens du user
      const user = oAuth2Client.credentials

      //Récupération des infos du user grâce à son access_token
      const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`,
          {
              headers: {
                  Authorization: `Bearer ${user.access_token}`
              }
          }
      )
      const data = await response.json()

      let name
      if (data.family_name) { name = data.family_name }

      const { email } = data
      const firstname = data.given_name
      const token = uid2(32)

      const result = await User.findOne({ email })

      // Si l'utilisateur se connecte
      if (result) {
          result.last_connection = new Date(),
          await result.save()

          const userInfos = {
            firstname : result.firstname,
            name : result.name,
            email : result.email,
            token : result.token,
            skills : result.skills,
          }

          const jwtToken = jwt.sign(userInfos, process.env.JWT_SECRET2);

          res.redirect(`${urlFront}/google/${jwtToken}`)

      }
      // Si l'utilisateur s'inscrit
      else {
          const newUser = new User({
              firstname,
              name,
              email,
              skills: [],
              token,
              last_connection: new Date(),
              searches: [],
              verified: true,
          })

          await newUser.save()

          const userInfos = {
            firstname,
            name,
            email,
            token,
            skills : [],
          }

          const jwtToken = jwt.sign(userInfos, process.env.JWT_SECRET2);

          res.redirect(`${urlFront}/google/${jwtToken}`)
      }


  } catch (err) { console.log(err) }
})










// ROUTE CONNEXION GOOGLE
router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	
      if (req.user) {
        const token = jwt.sign(
          { id: req.user._id, name: req.user.name, email: req.user.email },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        // Rediriger vers une page frontend (comme /google) avec le token dans le cookie
        res.cookie('jwt', token, { sameSite: 'none', httpOnly: false, secure: true, maxAge: 3600000, });
        res.redirect(`${urlFront}/google`); // Rediriger vers le frontend après auth
      } else {
        res.status(401).json({ error: 'Authentication failed' });
      }
    });

// ROUTE POUR OBTENIR LES INFOS USER POUR GOOGLE
router.get('/api/me', async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	

  const token = req.cookies.jwt;
  console.log('token:', token)
  console.log('req.headers:', req.headers)
  console.log('cookies:', req.cookies)
  
  if (!token) {
    return res.status(401).json({ error: 'No token found' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({
      token,
      name: decoded.name,
      email: decoded.email
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

//ROUTE INFO USER
router.post('/info-user', async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	
  const { token, email } = req.body;

  if (token) {
    User.findOne({ token }) 
      .then(data => {
        if (data) {
          res.json({ result: true, user: data });
        } else {
          res.json({ result: false, message: "Utilisateur non trouvé" })
        }
      });
  } else if (email) {
    User.findOne({ email }) 
      .then(data => {
        if (data) {
          res.json({ result: true, user: data });
        } else {
          res.json({ result: false, message: "Utilisateur non trouvé" })
        }
      })
  } else {
    res.json({ result: false, message: "Token ou email manquant" })
  }
});


// ROUTE DELETE USER ACCOUNT 
router.delete('/', async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	
  User.deleteOne({token: req.body.token})
  .then((data) => {
    if(data.deletedCount > 0) {
      res.json({result: true});
    } else {
        res.json({result: false, error: 'Utilisateur non trouvé'});
    }
  })
})

// ROUTE UPDATE USER NAME/FIRSTNAME/PASSWORD => modif via token
router.put('/update-user', async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	
  User.findOne({token: req.body.token})
  .then(data => {
    if (data !== null) {
      if(req.body.oldPassword) {
        if (data && bcrypt.compareSync(req.body.oldPassword, data.password)) {
          const hash = bcrypt.hashSync(req.body.newPassword, 1);
          User.updateOne({token: req.body.token}, {password: hash})
          .then(updateConfirm => {
            if(updateConfirm.updatedCount !== 0){
              User.findOne({token :req.body.token})
              .then( updatedUser => {
                res.json({result: true, user : updatedUser, message: 'Password updated successfully'})
              })
            }else{
              res.json({result: false, message:"Could not update User"})
            }
          })
        } else {
          res.json({result: false, error: 'Could not verify user'})
        }
      }

      else if(req.body.name) {
        User.updateOne({ token: req.body.token }, { name: req.body.name })
        .then(updateConfirm => {
          if(updateConfirm.updatedCount !== 0){
            User.findOne({token :req.body.token})
            .then( updatedUser => {
              res.json({result: true, user : updatedUser, message: 'Name updated successfully'})
            })
          }else{
            res.json({result: false, message:"Could not update User"})
          }
        })
      }

      else if(req.body.firstname) {
        User.updateOne({ token: req.body.token }, { firstname: req.body.firstname })
        .then(updateConfirm => {
          if(updateConfirm.updatedCount !== 0){
            User.findOne({token :req.body.token})
            .then( updatedUser => {
              res.json({result: true, user : updatedUser, message: 'Firstname updated successfully'})
            })
          }else{
            res.json({result: false, message:"Could not update User"})
          }
        })
      }
    } else {
      res.json({result: false, error: 'Could not verify user'})
    }
  })
})


//ROUTE UPDATE EMAIL AVEC VERIFICATION MAIL => modif via token 
router.put('/update-email',async (req,res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	
  User.findOne({email : req.body.email})
  .then(data => {
    if(data) 
      { res.json({result : false, message :"Email already used"})}
    else{
      User.updateOne({ token: req.body.token}, {email : req.body.email, verified: false})
        .then(data => {
          if (data.modifiedCount === 0) {
              res.json({result: false, message: "Update Fail"})
          }else{
              // SETUP COMPTE ENVOI DES MAILS CONFIRMATION
              const transporter = nodemailer.createTransport({
              service: "Gmail",
              host: "smtp.gmail.com",
              port: 465,
              secure: true,
              auth: {
                user: ourEmail,
                pass: ourPassword,
              },
              });
              // SETUP TOKEN A ENVOYER AU USER 
              const emailToken = jwt.sign({userId: req.body.token}, emailSecret, { expiresIn: '1h' });
              
              // URL ROUTE GET POUR CONFIRMER MAIL
              const url = `${urlBack}/users/new-email-confirmation/${emailToken}`;

              // MAIL ENVOYE
              const mailOptions = {
                from: ourEmail,
                to: req.body.email, //nouveau mail
                subject: "KAIROS - Confirmation Modification d'email",
                html: `
                  <body style="margin: 0; padding: 0;color:#163050;">
                    <div style="height: 50%; display: flex; flex-direction: column; margin: 0;padding: 5%;height: 100%;background: linear-gradient(to bottom, #F8E9A9, #ffffff)">
                      <h1 style="font-family:Calibri; align-self: center; border-bottom: 1px solid #163050">
                      Kairos
                      </h1>

                      <h2>Bonjour,</h2>

                      <h4 style="font-family:Calibri;">
                      Pour confirmer votre nouvelle adresse mail et accéder à tous nos services, merci de cliquer sur ce lien : <a href =${url}>confirmer votre adresse mail</a>
                      </h4>

                      <h5 style="font-family:Calibri;">
                      À bientôt sur Kairos !
                      </h5>
                    </div>
                  </body>`,
              };

              transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                  console.error("Error sending email: ", error);
                } else {
                  console.log("Email sent: ", info.response);
                  res.json({result : true})
                }
            })
          }
      })
    }
  })
})

//ROUTE CONFIRMATION EMAIL POUR CHANGEMENT EMAIL
router.get('/new-email-confirmation/:token', async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	

  // Récupérer le token du User avec jwt
  const user = jwt.verify(req.params.token, emailSecret);
  const userToken = user.userId

  //Modifier le champ verified du document User puis rediriger vers page confirmation
  User.updateOne({ token: userToken }, { verified: true })     
  .then(data => {
          if (data.modifiedCount === 0) {    
            User.findById(userId)
            .then(user => {
              user && res.json({result: false, error: 'Email already verified'})
              })
          }
          res.redirect(`${urlFront}/new-mail-confirm`)
  })
})

//route put pour updateOne user token google account
router.put('/update', async (req, res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

	
  User.updateOne({email: req.body.email}, {token: req.body.token})
  .then(data => {
    console.log(data)
    res.json({result: true})
  })
})

module.exports = router;