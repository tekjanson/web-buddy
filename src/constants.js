const url = 'https://github.com/tekjanson/Robotcorder';

const tab = { active: true, currentWindow: true };

const logo = { //what logo corresponds to what action that is currently happening
  stop: '/assets/icon-stop.png',
  record: '/assets/icon-record.png',
  scan: '/assets/icon-stop.png',
  action: '/assets/icon-action.png',
  pause: '/assets/icon-pause.png',
  POM: '/assets/icon-stop.png'
};

const filename = 'test_script.robot'; //when saving a testing file, this is the name it automatically saves to

const statusMessage = { //message in the main box during action 
  stop: 'Stopped',
  record: 'Recording action...',
  scan: 'Scanning html document...',
  POM: 'Opening File Explorer...' //this is to get the messgae in the box
};

const instruction = 'Robotcorder\n' //general instructions
  + '\n'
  + 'Generate your RobotFramework Test Script via\n'
  + '* Record user actions\n'
  + '* Scan the page for inputs\n'
  + '* Config the locators priorities that best suit your app\n'
  + '\n'
  + '\n'
  + 'Automating test automation 🤗';