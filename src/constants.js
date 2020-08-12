const url = 'https://github.com/tekjanson/Robotcorder';

const tab = { active: true, currentWindow: true };

const logo = {
  stop: '/assets/icon-stop.png',
  record: '/assets/icon-record.png',
  scan: '/assets/icon-stop.png',
  action: '/assets/icon-action.png',
  pause: '/assets/icon-pause.png',
  pom: '/assets/icon-stop.png' //changes robot icon
};

const filename = 'test_script.robot';

const statusMessage = {
  stop: 'Stopped',
  record: 'Recording action...',
  scan: 'Scanning html document...',
  pom: 'Opening file explorer...'//message displayed after button was clicked
};

const instruction = 'Robotcorder\n'
  + '\n'
  + 'Generate your RobotFramework Test Script via\n'
  + '* Record user actions\n'
  + '* Scan the page for inputs\n'
  + '* Config the locators priorities that best suit your app\n'
  + '\n'
  + '\n'
  + 'Automating test automation 🤗';