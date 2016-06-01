#!/usr/bin/env node
'use strict'
const expandHomeDir = require('expand-home-dir')
const yargs = require('yargs')
const fs = require('fs')
const FB = require('fb')
let openurl
try { 
    openurl = require('openurl')
} catch (e) {
    openurl = false
}
const WebSocket = require('ws')
const YAML = require('js-yaml')
const path = require('path')
const validUrl = require('valid-url')
const rw = require('rw')
const inquirer = require('inquirer')
const fields = require('./fields')

const TOKEN_FILE = expandHomeDir('~/.futor_token')
const TOKEN_SERVER_URL = 'wss://futor.con.com/ws'

const privacyEnum = [ 'SELF', 'ALL_FRIENDS', 'FRIENDS_OF_FRIENDS', 'EVERYONE', 'CUSTOM' ]

fields.getposts = fields.getpost

//FB.api = function (a, b, c) { //Fake, for testing.
//  c({"name":"Allen Luce","id":"10209681603216006"})
//}

const outData = function (argv, data) {
  if (!argv.jsonoutput) {
    data = YAML.safeDump(data)
  }
  console.log(data)
}

const callFB = function () {
  const args = (arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments))
  const argv = args.shift()

  let callafter
  if (typeof args[args.length-1] === 'function') {
    callafter = args.pop()
  }
  args.push(function (data) {
    if (data.error) {
      console.error(data.error)
      process.exit(1)
    }
    if (callafter) {
      callafter(data)
    } else {
      outData(argv, data)
    }
    process.exit(0)
  })
  console.log(args)
//  args[args.length-1]({'what':'no'})
  FB.api(...args)
//  FB.api.apply(FB, args)
}

class FF {
  static preProcess (argv) {
    // Output skeleton?
    if (argv.skeleton || argv.jskeleton) {
      let fileData = fs.readFileSync(path.resolve(
        path.join(__dirname, 'skeletons', argv._[0] + '.yaml'))).toString('utf-8')
      if (argv.jskeleton) { // convert YAML to JSON
        fileData = JSON.stringify(YAML.safeLoad(fileData), null, 4)
      }
      console.log(fileData)
      process.exit(0)
      return // Reachable by tests after process.exit() is stubbed.
    }
    let opts = {}
    // Parse input file, if any, first.
    if (argv.jsoninput || argv.yamlinput) {
      let filename = argv.jsoninput || argv.yamlinput
      if (typeof filename === 'boolean') {
        filename = '/dev/stdin'
      }
      const fileData = rw.readFileSync(filename).toString('utf-8')
      if (argv.yamlinput) { // YAML to JSON
        opts = YAML.safeLoad(fileData)
      } else { // JSON to JSON
        opts = JSON.parse(fileData)
      }
    }
    if (!opts.privacy) { // Not specified in file.
      opts.privacy = { value: argv.privacy }
    }
    if (!opts.fields) { // Not specified in file.
      if (argv.fields) { // Given on command line?
        opts.fields = argv.fields
      } else if (fields[argv._[0]]) { // No, do defaults exist?
        opts.fields = fields[argv._[0]] // Yes, set them.
      }
    }
    FF.setAccessToken(argv)
    return opts
  }

  static setAccessToken (argv) {
    try {
      const access_token = fs.readFileSync(argv.tokenfile).toString('utf-8')
      FB.setAccessToken(access_token)
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.error(`Auth token file ${argv.tokenfile} not found. Use 'auth' command to create it.`)
        process.exit(1)
      }
      console.error(e)
    }
  }

  static auth (argv) {
    var ws = new WebSocket(TOKEN_SERVER_URL)
    ws.on('open', function () {
      ws.send(`token ${argv.tokenfile}`)
    })
    ws.on('error', function (err) {
      console.error(`${err} contacting ${TOKEN_SERVER_URL}`)
      process.exit(1)
    })
    ws.on('message', function (data, flags) {
      // flags.binary will be set if a binary data is received.
      // flags.masked will be set if the data was masked.
      const msgs = data.split(' ')
      switch (msgs[0]) {
      case 'url':
	  if (openurl) {
              openurl.open(msgs[1])
	  } else {
	      console.log(`open ${msgs[1]} in your browser`)
	      console.log('Leave futor running while you do so.')
	  }
          break
        case 'token':
          const access_token = msgs[1]
          fs.writeFileSync(argv.tokenfile, access_token)
          ws.close()
          console.log(`Token saved to ${argv.tokenfile}`)
      }
    })
  }

  /*
    - Create regular post to a Facebook page
    - Create unpublished page post
    - List posts (published and unpublished)
    - Show # of viewers ("show the number of people who have viewed each post.")
  */

  /* For each function, define a filter that'll take the JSON and
   * convert fields into things that humans can deal with.

   It should have an "edit-output" filter that removes RO fields and
   converts others to managable forms. And an "edit-input" filter that does the converse.

  */

  static getposts (argv) {
    // /{user-id}/feed but just for this person.
    callFB(argv, '/me/posts', FF.preProcess(argv))
  }

  static getpost (argv) {
    // /{user-id}/feed but just for this person.
    callFB(argv, argv.postId, FF.preProcess(argv), function (Pdata) {
      callFB(argv, `/${argv.postId}/insights/page_views_total`, function (data) {
        outData(argv, Pdata)
        outData(argv, data)
      })
    })
  }

  // Input filter should:
  // - Take photo/attachment links and translate them as appropriate.
  // Also with icon field?  Link field?  Picture field?
  // Maybe also have privacy shortforms?

  // If no file is specified, it means write out a skeleton in a temp file
  // Then edit it.  Then take the edited version and validate it. Then post it.

  static post (argv) {
    const opts = FF.preProcess(argv)
    if (argv.message) {
      opts.message = argv.message
    }
    if (argv.link) {
      opts.link = argv.link
    }
    if (argv.interactive) { // Fill opts based on questions.
      var questions = [
        {
          type: 'list',
          name: 'type',
          message: 'What page is this for?',
          choices: ['mine', 'other']
        },
        {
          type: 'confirm',
          name: 'linkp',
          message: 'Add a link?',
          default: false
        },
        {
          type: 'input',
          name: 'link',
          message: 'Link URL:',
          when: function (answers) {
            return answers.linkp
          }
        },
        {
          type: 'confirm',
          name: 'messagep',
          message: 'add a message?',
          default: true
        },
        {
          type: 'input',
          name: 'message',
          message: 'Text of post:',
          when: function (answers) {
            return answers.messagep
          }
        }
      ]
      inquirer.prompt(questions).then(function (answers) {
        if (answers.message) {
          opts.message = answers.message
        }
        if (answers.link) {
          opts.link = answers.link
        }
        callFB(argv, '/me/feed', 'POST', opts)
      })
    } else {
      // Is this to a user page, other page, and event, or a group?
      // What's the (user, other, event, group) id?  Type "dir" to
      // see your choices.
      // Based on each, go through fields.

      // If it's a page, choose: "post as you/post as page?"  if the latter, get a page token.

      // Message fields..?
      // Mes
      console.log(opts)
      callFB(argv, '/me/feed', 'POST', opts)
    }
  }

  static updatepost (argv) {
    callFB(argv, `/${argv.postId}`, 'POST', FF.preProcess(argv))
  }

  static me (argv) {
    callFB(argv, 'me', FF.preProcess(argv))
  }

  static accounts (argv) {
    callFB(argv, '/me/accounts', FF.preProcess(argv))
  }

  static page (argv) {
    callFB(argv, `/${argv.pageId}`, FF.preProcess(argv))
  }

  static insights (argv) {
    FF.setAccessToken(argv)
    callFB(argv, `/${argv.objectId}/insights`)
  }

  static isFile (filename) {
    try {
      return fs.statSync(filename).isFile()
    } catch (e) {
      return false
    }
  }

  static postphoto (argv) {
    const opts = FF.preProcess(argv)
    const image = argv['imageFile|url']
    if (validUrl.isUri(image) && !FF.isFile(image)) {
      opts.url = image
    } else {
      opts.source = fs.createReadStream(image)
    }
    if (argv.caption) {
      opts.caption = argv.caption
    }
    callFB(argv, '/me/photos', 'post', opts)
  }
}

const noOpts = (yargs) => { return yargs }

if (!module.parent) {
  yargs
    .usage('Usage: $0 <command> [options]')
    .choices('privacy', privacyEnum)
    .option('t', {
      alias: 'tokenfile',
      default: TOKEN_FILE,
      describe: 'File for the auth token'
    })
    .option('p', {
      alias: 'privacy',
      default: privacyEnum[0],
      describe: 'Privacy level to support'
    })
    .option('j', {
      alias: 'jsonoutput',
      describe: 'Emit output as JSON'
    })
    .option('jsoninput', {
      describe: 'JSON file to use for data (or blank for stdin)'
    })
    .option('yamlinput', {
      describe: 'YAML file to use for data (or blank for stdin)'
    })
    .option('skeleton', {
      describe: 'Output YAML skeleton for command.'
    })
    .option('jskeleton', {
      describe: 'Output JSON skeleton for command.'
    })
    .option('f', {
      alias: 'fields',
      describe: 'Fields to fetch',
      type: 'array'
    })
    .global(['t', 'p', 'j', 'y', 'f', 'skeleton', 'jskeleton'])
    .command('auth', 'Obtain authentication token from Facebook', noOpts, FF.auth)
    .command('me', 'Get information about yourself', noOpts, FF.me)
    .command('accounts', 'Show Facebook Pages you administer', noOpts, FF.accounts)
    .command('getposts', 'Get all posts on your wall', noOpts, FF.getposts)
    .command('getpost <postId>', 'Get a particular post on your wall', noOpts, FF.getpost)
    .command('post [-i]', 'Create a post', (yargs) => {
      return yargs
        .option('interactive', {
          alias: 'i',
          describe: 'Post interactively'
        })
        .option('message', {
          describe: 'Message to post'
        })
        .option('link', {
          describe: 'URL of link to post'
        })
    }, FF.post)
    .command('updatepost <postId>', 'Update a post', noOpts, FF.updatepost)
    .command('page <pageId>', 'Get info on a page', noOpts, FF.page)
    .command('insights <objectId>', 'Get Facebook Insight info on an object', noOpts, FF.insights)
    .command('postphoto <imageFile|url>', 'Upload an image', (yargs) => {
      return yargs
        .option('caption', {
          alias: 'c',
          describe: 'Caption for image.'
        })
    }, FF.postphoto)
    .demand(1)
    .strict()
    .version()
    .help('h')
    .argv
} else {
  module.exports = FF
}

// More stuff to do:
// For JSON, support non-pretty (one line)

// Support some handy forms:
// - One line status update:
//   fb post "Hey, I'm in this place!" [--type=status] [--target=USER]
// - Adding pictures:
//   fb addphoto XXX.jpg [--album=default] [--caption=caption] [--tag=USER[,USER]]
//
// - Aliasing users.  "23094823098293" can be "bob"
//   fb alias 209384298924 bob

/* DONT FORGET!

   Make sure this can run within a web page.

   And deal with full-screen editing for VI/Emacs and whatever people use.

   Maybe look at some means of integrating it into a web-based editor??
*/
