import irisSetup from '..';

const readLine = require('readline');

const rl = readLine.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question({
  query,
  _rl = rl
}:{
  query: string,
  _rl?: typeof rl
}): Promise<string> {
  return new Promise((resolve, reject) => {
    _rl.question(query, (answer: string) => {
      resolve(answer);
    });
  });
}

interface Msg {
  author: string;
  comment: string;
}

async function chatListener({payload}: {payload?: any}): Promise<any> {
  console.log(`\n${payload.author}: ${payload.comment}`);
  return {ack: true};
}

function prepareNameListener(username: string) {
  return async function nameListener({payload}: {payload?: any}): Promise<any> {
    return {
      name: username
    };
  };
}

type ChatParams = {
  request: (params: {pattern: string, payload: any}) => Promise<any>,
  username: string,
  target: string,
  _question?: typeof question,
  _cmds?: typeof cmds
};

const cmds: {[k: string]: (params: {oldParams: ChatParams, _question?: typeof question}) => Promise<ChatParams>} = {
  'cntg': async ({oldParams, _question = question}) => {
    const target = await _question({query: 'New target: '});
    return {...oldParams, target};
  }
};

async function chat({
  request,
  username,
  target,
  _question = question,
  _cmds = cmds
}: ChatParams): Promise<void> {


  while (true) {
    const answer = await _question({query: `${username}: `});
    if(/:[a-z]/.test(answer)) {
      const cmd = answer.substring(1);
      return chat(await _cmds[cmd]({oldParams: {request, username, target, _question}}));
    } else {
      await request({pattern: `chat.${target}`, payload: { comment: `${answer}`, author: username}}).catch(console.warn);
    }
  }
}

async function init(
{ /* Default argument definition */
  _question = question,
  _irisSetup = irisSetup
}:{ /*Type signature of parameters */
  _question?: typeof question,
  _irisSetup?: typeof irisSetup
}): Promise<void> {
  const {request, register} = await _irisSetup({namespace: 'chat'});

  const username = await _question({query: 'Your username: '});

  register({pattern: `chat.${username}`, handler: chatListener});
  register({pattern: `chat.name.${username}`, handler: prepareNameListener(username)});

  const target = await _question({ query: 'Insert user: '});

  return chat({request, username, target});

}

init({}).catch(console.error);
