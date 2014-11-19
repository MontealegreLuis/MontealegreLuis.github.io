#!/bin/bash

bin/sculpin generate --env=prod
if [ $? -ne 0 ]; then echo "Could not generate the site"; exit 1; fi

rsync -avze 'ssh -p 4668' output_prod/ username@yoursculpinsite:public_html
if [ $? -ne 0 ]; then echo "Could not publish the site"; exit 1; fi
