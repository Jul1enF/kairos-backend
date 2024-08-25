require('dotenv').config();

var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
require('./models/connection');
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const searchesRouter = require('./routes/searches');
const session = require('express-session');
const passport = require('./config/auth');

const statusRouter = require('./routes/status');
const resultsRouter = require('./routes/results')
const dashboardRouter = require('./routes/dashboard')

var app = express();

const cors = require('cors');
app.use(cors({
    origin: 'https://kairos-frontend-six.vercel.app',
    credentials: true // Permet d'inclure les cookies dans les requêtes
  }));

app.use(session({ secret: 'oui', resave: false, saveUninitialized: true,
     cookie: {
    secure: false, // Mettre à true en production si HTTPS est activé
    httpOnly: true,
    maxAge: 3600000 // Durée de vie du cookie en millisecondes (1 heure)
  } }));
app.use(passport.initialize());
app.use(passport.session());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/searches', searchesRouter);
app.use('/status', statusRouter);
app.use('/results', resultsRouter)
app.use('/dashboard', dashboardRouter)

module.exports = app;
