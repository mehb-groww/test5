const {
  App,
  subtype
} = require('@slack/bolt');
const fetch = (...args) => import('node-fetch').then(({
  default: fetch
}) => fetch(...args));
const FormData = require('form-data');
const fs = require('fs');
const request = require('request');
const axios = require('axios');
const {
  secureHeapUsed
} = require('crypto');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000
});

// Bot Credentials
const credentials = process.env.USER_EMAIL + ":" + process.env.API_TOKEN;
// Bot accountId (Jira)
const accountId = process.env.ACCOUNT_ID;
// Bot userId (Slack)
const botUserId = process.env.BOT_ID;
// Jenkins Credentials
const jenkinsCred = process.env.USER_EMAIL + ":" + process.env.JENKINS_API_TOKEN;
// Jira Map 
var Jira_Map = fs.readFile("Jira_Mapping.json", "utf8", (err, jsonString) => {
  Jira_Map = JSON.parse(jsonString);
});
// Jenkins Map 
var Jenkins_Map = fs.readFile("Jenkins_Mapping.json", "utf8", (err, jsonString) => {
  Jenkins_Map = JSON.parse(jsonString);
});

const bodyData = `{
  "fields": {
     "project": {
        "key": ""
     },
     "summary": "Issue Created via Slack",
     "description": {
      "type": "doc",
      "version": 1,
      "content": [{
          "type": "paragraph",
          "content": [{
              "type": "text",
              "text": "Issue created through Slack"
            }]
          }]
        },
        "issuetype": {
          "name": "Task"
        },
        "reporter": {
          "id": ""
        },
        "labels": ""
      }
    }`;

// async function readFile(url){
//   var Map = fs.readFile(url, "utf8", async (err, jsonString) => {
//   Map= await JSON.parse(jsonString);
//   });
//   return Map
// }

async function fetchWithTimeout(url) {
  const timeout = 5000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(
      jenkinsCred
    ).toString('base64')}`
    },
    signal: controller.signal
  });
  clearTimeout(id);
  return response;
}

async function getJenkinsParameter(channelName) {
  console.log("Get Jenkins Job Parameters");

  if (!Jenkins_Map.hasOwnProperty(channelName))
    return "No Job Found Mapped To This Channel";

  var url = Jenkins_Map[channelName] + "api/json?tree=actions[parameterDefinitions[name,choices]]";
  var returnVal = "Success";

  var response = await fetchWithTimeout(
      url
    )
    .catch((error) => {
      returnVal = "Failure: Request Time Out";
      console.log("Time Out");
    })
  var response = await response.json();
  // console.log(response.actions[0].parameterDefinitions);
  returnVal = response.actions[0].parameterDefinitions;
  // console.log(returnVal.toString());
  return JSON.stringify(returnVal, null, 1);
}

async function triggerJenkinsJob(myArray, userName, channelName) {
  console.log("Trigger Jenkins Job")
  // console.log(Jenkins_Map);

  if (!Jenkins_Map.hasOwnProperty(channelName) || myArray.length != 4)
    return "Failure: Missing Parameter or Channel Not Configured";
  var url = Jenkins_Map[channelName] + "buildWithParameters?token=" + process.env.JENKINS_API_TOKEN;

  var description = "Remote Run From Slack";
  if (!(myArray[0] == ''))
    description = myArray[0];
  var env = myArray[1].trim().toLowerCase();
  var suite = myArray[2].trim().toLowerCase();
  var buildDescription = "&BUILD_DESCRIPTION=" + description + "[ Triggered By " + userName + " ]";
  var environment = "&ENVIRONMENT=" + env;
  var publish = "&REPORT=" + "True";
  var Suite = "&Suite=" + suite;
  var parameters = [buildDescription, environment, publish, Suite];
  console.log(parameters);

  for (var i = 0; i < parameters.length; i++)
    url += parameters[i];

  var returnVal = "Success";

  await fetchWithTimeout(
      url
    )
    .then(response => {
      console.log(
        `Response: ${response.status}`
      );
      if (response.status != 201)
        returnVal = "Failure";
      // return response.text();
    })

    .catch((error) => {
      returnVal = "Failure: Request Time Out";
      console.log("Time Out");
    })

  return returnVal;
}

async function getUserEmail(userId) {
  console.log("Retrieve User Email");
  try {
    const result = await app.client.users.info({
      user: userId
    });
    return result.user.profile.email;
  } catch (error) {
    console.error(error);
    return "";
  }
}

async function getUserName(userId) {
  console.log("Retrieve UserName");
  try {
    const result = await app.client.users.info({
      user: userId
    });
    return result.user.profile.display_name;
  } catch (error) {
    console.error(error);
    return "";
  }
}

async function getChannelName(channelId) {
  console.log("Retrieve Channel Name");
  try {
    const result = await app.client.conversations.info({
      channel: channelId
    });
    return result.channel.name;
  } catch (error) {
    console.error(error);
    return "superbot-testing";
  }
}

async function getJiraId(userEmail) {
  console.log("Retrieve User JiraId");

  jiraId = "";
  try {
    const requestUrl = 'https://' + process.env.DOMAIN + '.atlassian.net//rest/api/3//user/search?query=' + userEmail;
    await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(
          credentials
        ).toString('base64')}`,
          'Accept': 'application/json'
        }
      }).then(response => {
        console.log(
          `Response: ${response.status}`
        );
        return response.text();
      })
      .then(text => {
        const obj = JSON.parse(text);
        //console.log(obj);
        jiraId = obj[0].accountId;
      })
  } catch (error) {
    console.error(error);
    jiraId = accountId;
  }
  return jiraId;
}

function getProjectKey(userGrp) {
  console.log("Retrieve Project Details");
  // console.log(Jira_Map);

  // if (Jira_Map.hasOwnProperty(userGrp))
  //   return Jira_Map[userGrp]
  return process.env.PROJECT_KEY;
}

// function getProjectKey(){
//   console.log("Retrieve Project Key");
//   return process.env.PROJECT_KEY;
// }

// function getProjectNum(){
//   console.log("Retrieve Project Num");
//   return process.env.PROJECT_NUMBER;
// }

function getIssueType(Txt) {
  console.log("Retrieve Issue Type");

  if (Txt.toLowerCase().includes("task"))
    return "Task";
  else if (Txt.toLowerCase().includes("story"))
    return "Story";
  else
    return "Bug";
}

function getIndicesOf(searchStr, str, caseSensitive) {
  var searchStrLen = searchStr.length;
  if (searchStrLen == 0) {
    return [];
  }
  var startIndex = 0,
    index, indices = [];
  if (!caseSensitive) {
    str = str.toLowerCase();
    searchStr = searchStr.toLowerCase();
  }
  while ((index = str.indexOf(searchStr, startIndex)) > -1) {
    indices.push(index);
    startIndex = index + searchStrLen;
  }
  return indices;
}

function getUserIds(idx, txt) {
  var arr = []
  for (var i = 0; i < idx.length; i++) {
    var k = idx[i] + 2
    var id = "";
    while (txt[k] != ">") {
      id = id + txt[k];
      k = k + 1;
    }
    arr.push(id);
  }
  var set = new Set(arr);
  return set;
}

async function tagUsers(txt) {
  console.log("Tag Users");
  var arr = getUserIds(getIndicesOf("<@", txt, false), txt)
  arr = Array.from(arr);
  // console.log(arr);
  for (var i = 0; i < arr.length; i++) {
    var userName = await getUserName(arr[i]);
    // console.log(userName);
    txt = await txt.replace("<@" + arr[i] + ">", "@" + userName);
  }
  // console.log(txt);
  return [arr, txt];
}

async function getMembers(groupId) {
  try {
    const result = await app.client.usergroups.users.list({
      usergroup: groupId
    });
    // console.log(result);
    return result.users;
  } catch (error) {
    console.error(error);
  }

}

async function tagTeams(txt) {
  console.log("Get Project Board and Grp Member Ids");

  var arr = getIndicesOf("<!subteam^", txt, false)
  arr = Array.from(arr);
  // console.log(arr);
  var memberIds = []
  var grpIds = []
  var grpNames = []

  for (var i = 0; i < arr.length; i++) {
    var Str = "";
    var k = arr[i];
    while (txt[k] != ">") {
      Str = Str + txt[k];
      k = k + 1;
    }
    // console.log(Str);
    grpIds.push(Str.split("^")[1].split("|")[0]);
    grpNames.push(Str.split("|")[1])
    txt = await txt.replace(Str + ">", Str.split("|")[1]);
  }
  // console.log(grpIds);
  // console.log(grpNames);
  // console.log(txt);

  for (var k = 0; k < grpIds.length; k++) {
    memberIds = memberIds.concat(await getMembers(grpIds[k]));
  }
  // console.log(memberIds);
  return [grpNames, memberIds, txt];
}

function buildPayLoad(projectKey, Txt, Id, issueType, summary, Labels) {
  obj = JSON.parse(bodyData);
  if (summary != "")
    obj.fields.summary = summary;
  obj.fields.project.key = projectKey;
  obj.fields.description.content[0].content[0].text = Txt;
  obj.fields.issuetype.name = issueType;
  obj.fields.reporter.id = Id;
  obj.fields.labels = Labels;
  // obj.fields.assignee.id = Id;
  return JSON.stringify(obj);
}

/// Reply to a message with the channel ID and message TS
async function replyMessage(id, ts, str) {
  console.log("Replying to a message");
  try {
    // Call the chat.postMessage method using the built-in WebClient
    const result = await app.client.chat.postMessage({
      // The token you used to initialize your app
      token: process.env.SLACK_BOT_TOKEN,
      channel: id,
      thread_ts: ts,
      text: str
    });
    // Print result
    //console.log(result);
  } catch (error) {
    console.error(error);
  }
}

async function postMessage(id, str) {
  console.log("Post message to a channel");
  try {
    // Call the chat.postMessage method using the built-in WebClient
    const result = await app.client.chat.postMessage({
      // The token you used to initialize your app
      token: process.env.SLACK_BOT_TOKEN,
      channel: id,
      text: str
    });
    // Print result
    //console.log(result);
  } catch (error) {
    console.error(error);
  }
}

async function attachFiles(issueId, url) {
  console.log("Sending Attachments");

  const token = process.env.SLACK_BOT_TOKEN;
  const form = new FormData();
  form.append('file', request({
    url: url,
    headers: {
      'Authorization': 'Bearer ' + token
    }
  }));

  fetch('https://' + process.env.DOMAIN + '.atlassian.net/rest/api/3/issue/' + issueId + '/attachments', {
      method: 'POST',
      body: form,
      headers: {
        'Authorization': `Basic ${Buffer.from(
          credentials
         ).toString('base64')}`,
        'Accept': 'application/json',
        'X-Atlassian-Token': 'no-check',
      }
    })
    .then(response => {
      console.log(
        `Response: ${response.status}`
      );
      return response.text();
    })
    //  .then(text => console.log(text))
    .catch(err => console.error(err));
}

async function addWatchers(issueId, watcherEmail) {
  console.log("Adding Watchers");

  const watcherId = await getJiraId(watcherEmail);
  const bodyData = `"${watcherId}"`;
  // console.log(bodyData);
  fetch('https://' + process.env.DOMAIN + '.atlassian.net/rest/api/3/issue/' + issueId + '/watchers', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(
        credentials
       ).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: bodyData
    })
    .then(response => {
      console.log(
        `Response: ${response.status} ${response.statusText}`
      );
      // return response.text();
    })
}

/// Get Issue Id from conversation
async function getThreadIssueId(channelId, parentId) {
  console.log("Retrieve Issue Id From Thread");

  var issueId = "null";
  try {
    const result = await app.client.conversations.replies({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channelId,
      ts: parentId
    });
    // Print result
    // console.log(result.messages[1]);
    if (result.messages[0].reply_count <= 2)
      return issueId;

    let idx = 1;
    if (result.messages[2].text.includes("IssueId:"))
      idx = 2;

    // console.log(result.messages[idx].bot_id);    
    if (result.messages[idx].bot_id == botUserId) {
      issueId = result.messages[idx].text.split(",")[0].split(":")[1];
    }
  } catch (error) {
    console.error(error);
  }
  return issueId;
}

function buildCommentPayLoad(commentData, Txt) {
  console.log("Building Comment PayLoad");
  obj = JSON.parse(commentData);
  //obj.author.self = userLink;
  //obj.author.accountId = userJiraId;
  obj.body.content[0].content[0].text = Txt;
  return JSON.stringify(obj);
}

function buildCommentPayLoad_withMention(commentData, jiraId, Txt, mentionTxt) {
  console.log("Building Comment PayLoad");
  obj = JSON.parse(commentData);
  obj.body.content[0].content[0].text = Txt;
  obj.body.content[0].content[1].attrs.text = mentionTxt;
  obj.body.content[0].content[1].attrs.id = jiraId;
  return JSON.stringify(obj);
}

async function addComment(user, issueId, txt) {
  console.log("Adding Comment");

  var commentData = `{
    "body": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "text": "",
              "type": "text"
            }
          ]
        }
      ]
    }
  }`;

  //const userJiraId = await getUserEmail(user));
  const display_name = await getUserName(user);
  //const userLink = 'https://'+process.env.DOMAIN+'.atlassian.net/rest/api/3/user?accountId='+userJiraId;
  // if(txt.includes('@')){
  //       console.log("Comment Has A Mention");
  //       const userId = txt.split("@")[1].split(">")[0];
  //       //console.log("User Mentioned: "+userId);
  //       const userName = await getUserName(userId);
  //       const userEmail = await getUserEmail(userId);
  //       const jiraId = await getJiraId(userEmail);
  //       commentData = `{
  //         "body": {
  //           "type": "doc",
  //           "version": 1,
  //           "content": [
  //             {
  //               "type": "paragraph",
  //               "content": [
  //                 {
  //                   "text": "",
  //                   "type": "text"
  //                 },
  //                 {
  //                   "type": "mention",
  //                   "attrs": {
  //                   "id": "",
  //                   "text": "",
  //                   "userType": "SPECIAL"
  //                   }
  //                 }
  //               ]
  //             }
  //           ]
  //         }
  //       }`;

  //     mentionTxt = "@"+userName;
  //     txt = tagUsers(txt);
  //     //console.log(txt);
  //     commentData = buildCommentPayLoad_withMention(commentData,jiraId,txt,mentionTxt);
  // }
  // else
  obj = await tagUsers(txt);
  var taggedUsers = obj[0];

  obj2 = await tagTeams(obj[1]);
  memberIds = obj2[1];

  txt = obj2[2];
  txt = display_name + " : " + txt;
  commentData = buildCommentPayLoad(commentData, txt);
  // console.log(commentData);
  // console.log(taggedUsers);

  console.log("Add Comment Request");
  fetch('https://' + process.env.DOMAIN + '.atlassian.net/rest/api/3/issue/' + issueId + '/comment', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(
      credentials
      ).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: commentData
    })
    .then(response => {
      console.log(
        `Response: ${response.status}`
      );
      return response.text();
    })
    // .then(text => console.log(text))
    .catch(err => console.error(err));

  for (var i = 0; i < taggedUsers.length; i++)
    addWatchers(issueId, await getUserEmail(taggedUsers[i]));
  for (var i = 0; i < memberIds.length; i++)
    addWatchers(issueId, await getUserEmail(memberIds[i]));
}

app.message(async ({
  message,
  say
}) => {

  console.log("Message Event");
  // console.log(message);  

  // Check for unthreaded message
  if (message.text == undefined || message.user == botUserId)
    return;
  // Check for edited/deleted messages    
  if (message.subtype != undefined && message.subtype != "file_share")
    return;

  if (message.thread_ts != undefined) {
    var issueId = await getThreadIssueId(message.channel, message.thread_ts);
    //console.log(issueId);
    if (issueId != "null") {
      if (message.files != undefined) {
        for (var i = 0; i < message.files.length; i++) {
          attachFiles(issueId, message.files[i].url_private_download);
        }
      }
      addComment(message.user, issueId, message.text);
    }
    return;
  }

  string = message.text;
  const channelName = await getChannelName(message.channel);
  // console.log(channelName);

  // Check for Keyword   
  if (string.toLowerCase().includes("get job parameters")) {
    var res = await getJenkinsParameter(channelName);
    if (res.includes("Failure"))
      await replyMessage(message.channel, message.ts, res);
    else
      await postMessage(message.channel, res);
    return;
  }

  if (string.toLowerCase().includes("-run")) {
    var res = await triggerJenkinsJob(string.split("-"), await getUserName(message.user), channelName);
    // console.log(res);
    if (res.includes("Failure"))
      await replyMessage(message.channel, message.ts, res);
    return;
  }

  if (!string.toLowerCase().includes("#create") && !string.toLowerCase().includes("#raise")) {
    if (channelName.includes("bugs"))
      await replyMessage(message.channel, message.ts, "If you are reporting an issue, please include #Create at the end of your message and tag the appropriate team.");
    return;
  }

  const myArray = string.split("#");
  // console.log(myArray);
  const userEmail = await getUserEmail(message.user);
  //console.log(userEmail); 
  const jiraId = await getJiraId(userEmail);
  //console.log(jiraId);

  const obj = await tagUsers(myArray[0]);
  const taggedUsers = obj[0];

  const obj2 = await tagTeams(obj[1]);
  const grpNames = obj2[0];
  const memberIds = obj2[1];
  const description = obj2[2];

  if (grpNames.length == 0)
    grpNames.push("default");
  const projectKey = await getProjectKey(grpNames[0]);
  // const projectNum = projectDetails[1];
  // console.log(projectKey)
  // console.log(projectNum);
  const issueType = getIssueType(myArray[myArray.length - 1]);
  var summary = "";
  var tmp = 0;

  var labels = ["SuperBot", channelName];

  const arrWord = description.split(" ");
  for (var i = 0; i < arrWord.length; i++) {
    summary += arrWord[i] + " ";
    tmp += 1;
    if (tmp > 10)
      break;
  }

  if (myArray.length == 3) {
    summary = summary + "[ " + myArray[1] + "]";
    labels.push(myArray[1]);
  }

  const watchers = process.env.WATCHERS_EMAIL.split("_");

  var taggedUsersEmail = []
  for (var i = 0; i < taggedUsers.length; i++) {
    taggedUsersEmail.push(await getUserEmail(taggedUsers[i]));
  }

  var membersEmail = []
  for (var i = 0; i < memberIds.length; i++) {
    membersEmail.push(await getUserEmail(memberIds[i]));
  }
  // console.log(membersEmail);

  // build payLoad 
  const payLoad = buildPayLoad(projectKey, description, jiraId, issueType, summary, labels);
  // console.log(payLoad);

  console.log("Creating Issue");

  // Issue Creation Request
  const urlIssue = 'https://' + process.env.DOMAIN + '.atlassian.net//rest/api/3/issue';
  fetch(urlIssue, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(
      credentials
      ).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: payLoad
    })

    .then(response => {
      console.log(
        `Response: ${response.status}`
      );
      return response.text();
    })

    .then(async text => {
      //console.log(text);
      console.log("Sharing IssueLink With User");

      const obj = JSON.parse(text);
      const issueLink = "https://" + process.env.DOMAIN + ".atlassian.net/browse/" + obj.key;
      // Uses a known channel ID and message TS
      await replyMessage(message.channel, message.ts, "IssueId:" + obj.key + ", please update assignee and sprint in the ticket");
      await replyMessage(message.channel, message.ts, "Your ticket has been created at: " + issueLink);

      if (message.files != undefined) {
        for (var i = 0; i < message.files.length; i++) {
          attachFiles(obj.key, message.files[i].url_private_download);
        }
      }

      if (taggedUsers.length == 0 && memberIds.length == 0) {
        for (var i = 0; i < watchers.length; i++)
          addWatchers(obj.key, watchers[i]);
      }

      for (var i = 0; i < taggedUsersEmail.length; i++)
        addWatchers(obj.key, taggedUsersEmail[i]);
      for (var i = 0; i < membersEmail.length; i++)
        addWatchers(obj.key, membersEmail[i]);
    })
    .catch(err => console.error(err));
});


// app.message(subtype('file_share'), async ({ message, say }) => {
//   if(message.thread_ts!=undefined)
//       return;
//   say({
//     text: `A user uploaded a file of type `+ message.files[0].filetype
//   });

//  console.log(message.files[0]);
//  const url = message.files[0].url_private_download;
//  const token = process.env.SLACK_BOT_TOKEN.toString();
//  const form = new FormData();
//  form.append('file', request(url, headers={'Authorization': 'Bearer %s' % token}));

//  fetch('https://'+process.env.DOMAIN+'.atlassian.net/rest/api/3/issue/SU-2/attachments', {
//      method: 'POST',
//      body: form,
//      headers: {
//          'Authorization': `Basic ${Buffer.from(
//           credentials
//          ).toString('base64')}`,
//          'Accept': 'application/json',
//          'X-Atlassian-Token': 'no-check',
//      }
//  })
//      .then(response => {
//          console.log(
//              `Response: ${response.status} ${response.statusText}`
//          );
//          return response.text();
//      })
//      .then(text => console.log(text))
//      .catch(err => console.error(err));
// });

// Listens to app mention, func to test out new features
app.event('app_mention', async ({
  event,
  context,
  client,
  say
}) => {
  console.log("App_Mention Event");
  // check if this is an unthreaded message
  if (event.thread_ts != undefined)
    return;

  // console.log(event);
  display_name = await getUserName(event.user);
  //console.log(display_name);  
  //const userEmail = await getUserEmail(event.user);
  //console.log(userEmail); 
  //const jiraId = await getJiraId(userEmail);
  //console.log(jiraId);

  try {
    // Uses a known channel ID and message TS
    await replyMessage(event.channel, event.ts, "Hey " + display_name + " :wave:");
    //createBox(event.channel);
  } catch (error) {
    console.error(error);
  }

  if (event.text.toLowerCase().includes("help")) {
    txt = `To Create a Jira Ticket, please follow the following structure:
Description #Feature (Optional) #Create(issueType)`
    await replyMessage(event.channel, event.ts, txt);
    txt = `To Run a Jenkins Job, please follow the following structure:
Description #Environment #Suite #Run`
    await replyMessage(event.channel, event.ts, txt);
  }

});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ SuperBot is running!');
})();