# Robotcorder

[![Greenkeeper badge](https://badges.greenkeeper.io/sohwendy/Robotcorder.svg)](https://greenkeeper.io/)
[![Build Status](https://travis-ci.org/sohwendy/Robotcorder.svg?branch=master)](https://travis-ci.org/sohwendy/Robotcorder)
[![Known Vulnerabilities](https://snyk.io/test/github/sohwendy/robotcorder/badge.svg?targetFile=package.json)](https://snyk.io/test/github/sohwendy/robotcorder?targetFile=package.json)

> A browser extension (beta) that generates [RobotFramework](http://robotframework.org/) test scripts

## Features

1. Recording user actions
2. Scanning the html page
3. Mouse over, while recording press Alt+h to insert a hover over directly where you mouse currenty is
4. Using Custom Keywords, if you need to have an element xpath as an argment you can click on the element textarea and then go back to your reocrd tab and use Alt+h to hover over the element to add its xpath to the selected textarea. hit submit to save that dynamic keyword to the robot script

[Read more..](http://bit.ly/robotcorder-blog)

[Watch it in action!](http://bit.ly/robotcorder-video)

** New Feature (22 Sept 2018) **  
Edit the locators.  
go to chrome://extensions  
click on Extension options  
edit and update the locators

## How To Add The Extension
1. Clone the repository (``` $ git clone https://github.com/tekjanson/Robotcorder.git ```)
2. Once the reposityry has been cloned, go to chrome://extensions/
3. In the upper right hand corner of the page, silde the toggle so that developer mode is ON
4. Select "Load Unpack" 
5. Select the cloned repository folder and click "Open"
6. The Robocorder extension will appear, ready to use



## Change Log
Refer to [CHANGELOG.md](http://bit.ly/robotcorder-changelog)


## Github Pages
Found in /docs.
Refer to [Robotcorder-Page](https://sohwendy.github.io/Robotcorder-Page/) for instruction how to update github page.


[![forthebadge](https://forthebadge.com/images/badges/made-with-javascript.svg)](https://forthebadge.com)
[![forthebadge](https://forthebadge.com/images/badges/contains-technical-debt.svg)](https://forthebadge.com)


[![forthebadge](https://forthebadge.com/images/badges/check-it-out.svg)](https://forthebadge.com)
[![forthebadge](https://forthebadge.com/images/badges/does-not-contain-msg.svg)](https://forthebadge.com)
[![forthebadge](https://forthebadge.com/images/badges/powered-by-water.svg)](https://forthebadge.com)




## Future work and known issues
1. need a way to automatically source the keyword file in the robot script file
2. bug with the recorder loosing focus on tab when interacting with POM popup, to get around this start recording before selecting your POM
3. Add a way to run execute the dynamic POM, this will also be extremely helpful for debugging
4. look into adding API testing