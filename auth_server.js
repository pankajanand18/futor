#!/usr/bin/env node
'use strict'
const FB = require('fb')
const server = require('http').createServer()
const express = require('express')
const session = require('express-session')
const config = require('/etc/fb_config.json')
const ConnectSqlite3 = require('connect-sqlite3')
const WebSocketServer = require('ws').Server
const crypto = require('crypto')
const hdate = require('human-date')

const app = express()

const CS = new ConnectSqlite3(session)
const cs = new CS({
  db: 'fb_auth_session',
  mode: 0x20046,
  dir: '.'
})

const connections = {}

function randomString () {
  const buf = crypto.pseudoRandomBytes(15)
  return buf.toString('base64').replace(/\+/g, '0').replace(/\//g, '1')
}

app.use(session({
  secret: config.SESSION_SECRET,
  store: cs,
  resave: true,
  saveUninitialized: true,
  name: 'futor_auth',
  cookie: {
    maxAge: 24 * 60 * 60 // Log in within a day, please.
  }
}))

const wss = new WebSocketServer({ server: server })

// Note the port given, redirect to FB login.
app.get('/gettoken', function (req, res) {
  const url = FB.getLoginUrl({
    client_id: config.CLIENT_ID,
    scope: 'publish_actions,public_profile,email,user_friends,user_posts,read_insights,manage_pages,pages_manage_instant_articles',
    redirect_uri: config.AUTHURL + '/authorize'
  })
  // Store port for later use.
  req.session.fid = req.query.fid
  req.session.file = req.query.file
  // Send to log in.
  res.redirect(url)
})

// Convert code to token, redirect to localhost with it.
app.get('/authorize', function (req, res) {
  FB.api('oauth/access_token', {
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    redirect_uri: config.AUTHURL + '/authorize',
    code: req.query.code
  }, function (ret) {
    res.set('Connection', 'close')
    if (!ret || ret.error) {
      res.send(!ret ? 'error occurred' : ret.error)
      return
    }
    const accessToken = ret.access_token
    connections[req.session.fid].send(`token ${accessToken}`)
    res.type('text/plain')
    let extra = ""
    if (ret.expires) {
        extra = `Expires in ${ret.expires} seconds on ${hdate.prettyPrint(ret.expires)} (${hdate.relativeTime(ret.expires)})`
    }
    res.send(`Token saved to ${req.session.file}\n${extra}`)
  })
})

wss.on('connection', function (ws) {
  const connId = randomString()
  connections[connId] = ws
  ws.on('message', function (data) {
    const msgs = data.split(' ')
    switch (msgs[0]) {
      case 'token':
        ws.send(`url ${config.AUTHURL}/gettoken?fid=${connId}&file=${msgs[1]}`)
        break
    }
  })
  ws.send('started')
})

server.on('request', app)
server.listen(config.BINDPORT, function () {
  console.log('Listening on ' + server.address().port)
})
