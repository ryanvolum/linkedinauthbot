'use strict';

const restify = require('restify');
const builder = require('botbuilder');
const passport = require('passport');
const LinkedinStrategy = require('passport-linkedin-oauth2').Strategy;
const expressSession = require('express-session');
const crypto = require('crypto');
const querystring = require('querystring');
const https = require('https');
const request = require('request');

//oauth details
const LINKEDIN_CLIENT_ID = "86n4804y5nuate";
const LINKEDIN_CLIENT_PASSWORD = "PhKwK8gF5j4VcCv3";
const AUTHBOT_CALLBACKHOST = "localhost:3979";
const MICROSOFT_APP_ID = "";

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3979, function () {
  console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
console.log('started...')
console.log(MICROSOFT_APP_ID);
var connector = new builder.ChatConnector({
  appId: "",
  appPassword: ""
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());
server.get('/', restify.serveStatic({
  'directory': __dirname,
  'default': 'index.html'
}));
//=========================================================
// Auth Setup
//=========================================================

server.use(restify.queryParser());
server.use(restify.bodyParser());
server.use(expressSession({ secret: 'keyboard cat', resave: true, saveUninitialized: false }));
server.use(passport.initialize());

server.get('/auth/linkedin', function (req, res, next) {
  passport.authenticate('linkedin', { failureRedirect: '/auth/linkedin', state: req.query.address }, function (err, user, info) {
    console.log('login');
    if (err) {
      console.log(err);
      return next(err);
    }
    if (!user) {
      return res.redirect('/login');
    }
    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      } else {
        return res.send('Welcome ' + req.user.displayName);
      }
    });
  })(req, res, next);
});

server.get('/auth/linkedin/callback',
  passport.authenticate('linkedin', { failureRedirect: '/auth/linkedin' }),
  (req, res) => {

    //console.log('OAuthCallback');
    //console.log(req);

    const address = JSON.parse(req.query.state);
    const messageData = { accessToken: req.session.accessToken, refreshToken: req.session.refreshToken, userId: address.user.id, name: req.user.displayName, email: req.user.emails[0] ? req.user.emails[0] : "", linkedInUserId: req.user.id };

    var continueMsg = new builder.Message().address(address).text(JSON.stringify(messageData));
    console.log(continueMsg.toMessage());

    bot.receive(continueMsg.toMessage());
  });

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (id, done) {
  done(null, id);
});

passport.use(new LinkedinStrategy({
  clientID: LINKEDIN_CLIENT_ID,
  clientSecret: LINKEDIN_CLIENT_PASSWORD,
  callbackURL: "http://localhost:3979/auth/linkedin/callback",
  scope: ['r_basicprofile', 'r_emailaddress'],
  passReqToCallback: true
},
  function (req, accessToken, refreshToken, profile, done) {
    // asynchronous verification
    req.session.accessToken = accessToken;
    process.nextTick(function () {
      // To keep the example simple, the user's Linkedin profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Linkedin account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));

//=========================================================
// Bots Dialogs
//=========================================================
function login(session) {
  // Generate signin link
  const address = session.message.address;

  // TODO: Encrypt the address string
  var msg = AUTHBOT_CALLBACKHOST + '/auth/linkedin?address=' + querystring.escape(JSON.stringify(address))
  session.send(msg);
  builder.Prompts.text(session, "You must first sign into your account.");
}

bot.dialog('signin', [
  (session, results) => {
    console.log('signin callback: ' + results);
    session.endDialog();
  }
]);

bot.dialog('/', [
  (session, args, next) => {
    if (!(session.userData.loginData && session.userData.loginData.name && session.userData.loginData.accessToken)) {
      session.send("Welcome! This bot logs you into linked in!");
      session.beginDialog('signinPrompt');
    } else {
      next();
    }
  },
  (session, results, next) => {
    if (session.userData.loginData.name && session.userData.loginData.accessToken) {
      // They're logged in
      session.send("Welcome " + session.userData.loginData.name + "! You successfully authenticated!");
      session.replaceDialog("promptOptions");
    } else {
      session.endConversation("Goodbye.");
    }
  }
]);

bot.dialog("promptOptions", [
  (session) => {
    builder.Prompts.choice(session, "What would you like to do?", ['Get Profile Info'], { listStyle: builder.ListStyle.button });
  },
  (session, results) => {
    if (results.response.entity === "Get Profile Info") {
      if (session.userData.loginData.name) {
        session.send("You are " + session.userData.loginData.name + ". Your email is " + session.userData.loginData.email.value + " and your LinkedIn user ID is " + session.userData.loginData.linkedInUserId);
      } else {
        session.send("I don't know who you are...");
      }
    }
  }
])

bot.dialog('signinPrompt', [
  (session, args) => {
    if (args && args.invalid) {
      // Re-prompt the user to click the link
      builder.Prompts.text(session, "please sign in by clicking the link!");
    } else {
      login(session);
    }
  },
  (session, results) => {
    //resuming
    session.userData.loginData = JSON.parse(results.response);
    if (session.userData.loginData && session.userData.loginData.accessToken && session.userData.loginData.linkedInUserId && session.userData.loginData.name) {
      session.endDialog("Welcome " + session.userData.loginData.name + "! You are now logged in to Linked In. ");
    } else {
      session.replaceDialog('signinPrompt', { invalid: true });
    }
  }]);

function getAccessTokenWithRefreshToken(refreshToken, callback) {
  console.log("getAccessTokenWithRefreshToken");
  var data = 'grant_type=refresh_token'
    + '&refresh_token=' + refreshToken
    + '&client_id=' + AZUREAD_APP_ID
    + '&client_secret=' + encodeURIComponent(AZUREAD_APP_PASSWORD)

  var options = {
    method: 'POST',
    url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    body: data,
    json: true,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  };

  request(options, function (err, res, body) {
    if (err) return callback(err, body, res);
    if (parseInt(res.statusCode / 100, 10) !== 2) {
      if (body.error) {
        return callback(new Error(res.statusCode + ': ' + (body.error.message || body.error)), body, res);
      }
      if (!body.access_token) {
        return callback(new Error(res.statusCode + ': refreshToken error'), body, res);
      }
      return callback(null, body, res);
    }
    callback(null, {
      accessToken: body.access_token,
      refreshToken: body.refresh_token
    }, res);
  });
}
