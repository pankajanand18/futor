# Futor

The Facebook command-line app.

## Installation

You'll need [node.js](nodejs.org) and (npm)[npmjs.org] installed.

Install the command globally:

    npm install -g futor

## Usage

For a quick post to your wall ("status update"), just do:

    futor post --message "Hey guys! I've got futor going!'

To include a link:

    futor post --message "Hey guys! Check this out!" --link http://futor.con.com

To include a photo:

    futor post --message "Great image!" --photo my_cat.jpg

You can also use an image link:

    futor post --message "Great image!" --photo http://greatcats.com/my_cat.jpg

If you'd prefer to be prompted through all your options:

    futor post -i

To upload a photo to your photo library:

    futor postphoto --photo my_cat.jpg
