# Futor

Facebook on the command-line!

## Installation

You'll need [node.js](http://nodejs.org) and [npm](http://npmjs.org) installed.

To install the command globally:

    npm install -g futor

## Authenticating

Nearly all operations require that you be authenticated. This command
does this:

    futor auth

It will direct you to a Facebook page for giving Futor privileges.

## Getting Stats

Basic data from the Insights API can be obtained:

    futor insights -i

Using `-i` will prompt you for a page to give insights about.

## Posting


For a quick post to your wall ("status update"), just do:

    futor post --message "Hey guys! I've got Futor going!'

To include a link:

    futor post --message "Hey guys! Check this out!" --link http://futor.con.com

If you'd prefer to be lead through the process:

    futor post -i

To upload a photo to your photo library:

    futor postphoto my_cat.jpg

Which can also be a link:

    futor postphoto http://greatcats.com/my_cat.jpg

Try `futor -h` for more help.
