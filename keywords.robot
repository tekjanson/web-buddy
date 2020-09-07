*** Keywords ***
Documentation
...               This file contains Keywords related to robot UI testing for XLR
#sourceLocation:keywords.robot
#robotcorder start
#ARGS:2,string,string
Login
    [Documentation]    This keyword is used to login into XLR with username and password
    [Arguments]    ${user_name}    ${pass_word}
    Wait Until Element Is Visible    //input[@id="inputLogin"]
    Wait Until Element Is Visible    //input[@id="inputPassword"]
    Input Text    //input[@id="inputLogin"]    ${user_name}
    Input Text    //input[@id="inputPassword"]    ${pass_word}
    Wait Until Element Is Visible    //button[@class="button primary" and @type="submit"]
    Click Element    //button[@class="button primary" and @type="submit"]
#robotcorder stop

#robotcorder start
#ARGS:1,string
Delete User
    [Documentation]    This keyword is used to delete a specific user with its username
    [Arguments]    ${newuser}
    Wait Until Element Is Visible    //td[@class="name ng-binding" and text()="${newuser}"]
    Click Element    //td[@class="name ng-binding" and text()="${newuser}"]/..//i[@class="xl-icon delete-icon"]
    Wait Until Element Is Visible    //button[@class="button continue primary"]
    Click Element    //button[@class="button continue primary"]
#robotcorder stop

#robotcorder start
#ARGS:4,string,string,string,string
Create User
    [Documentation]    This keyword is used to create new user with necessary required details
    [Arguments]    ${fullname}    ${newusername}    ${email}    ${newuserpassword}
    Click Element    //span[@class="button primary new-user ng-scope"]
    Input Text    //input[@name="full-name"]    ${fullname}
    Input Text    //input[@name="username"]    ${newusername}
    Input Text    //input[@name="email"]    ${email}
    Input Text    //input[@data-test="password-input"]    ${newuserpassword}
    Input Text    //input[@name="passwordConfirmation"]    ${newuserpassword}
    Click Element    //button[@class="button save primary"]
#robotcorder stop

#robotcorder start
#ARGS:1,string
Go To Tab
    [Documentation]    This keyword is used to navigate through different tabs and pages
    [Arguments]    ${tabname}
    Wait Until Element Is Visible    //span[@class="ng-binding" and text()="${tabname}"]
    Click Element    //span[@class="ng-binding" and text()="${tabname}"]
#robotcorder stop

#robotcorder start
#ARGS:1,element
Click On
    [Documentation]    This keyword wait for an element to be visible and click that element
    [Arguments]    ${element}
    Wait Until Element Is Visible    ${element}
    Click Element    ${element}
#robotcorder stop

#robotcorder start
#ARGS:2,element,string
Write In
    [Documentation]    This keyword wait for an element to be visible and input the given text
    [Arguments]    ${element}    ${text}
    Wait Until Element Is Visible    ${element}
    Input Text    ${element}    ${text}
#robotcorder stop

#robotcorder start
#ARGS:1,element
Mouse Hover
    [Documentation]    This keyword wait for an element to be visible and mouse over that element
    [Arguments]    ${element}
    Wait Until Element Is Visible    ${element}
    Mouse Over    ${element}
#robotcorder stop

#robotcorder start
#ARGS:2,element,string
Select From Dropdown
    [Documentation]    This keyword wait for an element to be visible and select the passed option from list
    [Arguments]    ${element}    ${option}
    Wait Until Element Is Visible    ${element}
    Select From List By Value    ${element}    ${option}
#robotcorder stop