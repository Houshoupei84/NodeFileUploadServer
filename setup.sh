#! /bin/sh

# Create data directory structure:
echo 'Creating data directory structure...'
mkdir -p data/info data/file

# Download required Node modules:
echo 'Downloading required Node modules...'
git clone git://github.com/bentomas/node-mime.git
git clone git://github.com/felixge/node-formidable.git formidable

# Finish:
echo 'Setup finished'

