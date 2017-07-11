import * as test from 'tape';
import {Test} from 'tape';
import { stub, spy } from 'sinon';
import { setupAdd } from './add';
import {Channel} from 'amqplib';

function mockChannel(): any {
  return {
    assertExchange: spy(),
    assertQueue: spy(),
    prefetch: spy(),
    bindQueue: spy(),
    consume: spy(),
    sendToQueue: spy(),
    ack: spy()
  };
}

function mockSerialization() {
  return {
    parse: stub().returns({}),
    serialize: stub().returns(Buffer.from('{}'))
  };
}

function fakeMessage() {
  return {
    content: Buffer.from('{}'),
    properties: {
      replyTo: 'any-queue',
      correlationId: 'unique'
    }
  };
}

const libOptions = {
  url: 'amqp://rabbit',
  exchange: 'rpc_exchange',
  queue: 'test'
};

function wait(time: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => resolve(), time);
  });
}

test('Everything goes well in add function', (t: Test) => {

  const ch = mockChannel();

  const expectedResponse = Buffer.concat([Buffer.from([0x0]), Buffer.from('{}')]);
  const implementation = stub().returns(Promise.resolve(JSON.parse(expectedResponse.slice(1).toString())));

  async function test() {
    const args = { ...libOptions, ch };
    const add = await setupAdd(args);

    t.equals(typeof add, 'function', 'setupAdd returns the add function');

    t.ok(ch.assertExchange.calledOnce, 'A new exchange is created if none exists');

    const exCall = ch.assertExchange.getCall(0);
    t.equals(exCall.args[0], libOptions.exchange, 'The exchange used is the one provided in the lib options');
    t.equals(exCall.args[1], 'topic', 'The exchange provided is of type "topic"');

    const pattern = 'simple.test.works';
    await add({pattern, implementation});

    t.ok(ch.assertQueue.calledOnce, 'A new queue is created for the functionality');
    t.ok(ch.assertQueue.getCall(0).args[0].indexOf(pattern) === 0, 'The queue name contains the name of the pattern');

    t.ok(ch.bindQueue.calledOnce, 'The queue is binded to the exchange');
    const bindCall = ch.bindQueue.getCall(0);
    t.ok(bindCall.args[0].indexOf(pattern) === 0, 'The queue binded is the created for this functionality');
    t.equals(bindCall.args[1], libOptions.exchange, 'It binds the queue to the configured exchange');

    t.ok(ch.consume.calledOnce, 'It starts consuming the queue');
    const consumeCall = ch.consume.getCall(0);
    t.ok(consumeCall.args[0].indexOf(pattern) === 0, 'The queue consumed is the specific of this service');

    const consumer = consumeCall.args[1];

    const message = fakeMessage();
    await consumer(message);

    t.ok(implementation.calledOnce, 'The implemented function is called on message');
    t.deepEquals(implementation.getCall(0).args[0], JSON.parse(message.content.toString()), 'The implementation is called with the message content');

    t.ok(ch.sendToQueue.calledOnce, 'The library pipes the response to request service');
    const sendCall = ch.sendToQueue.getCall(0);
    t.equals(sendCall.args[0], message.properties.replyTo, 'It replies to the requested queue');
    t.deepEquals(sendCall.args[1], expectedResponse, 'It puts to the queue the response from the implementation');
    t.equals(sendCall.args[2].correlationId, message.properties.correlationId, 'It adds the correlation id received from the message');

    t.ok(ch.ack.calledOnce, 'ACK is being called');
    t.equals(ch.ack.getCall(0).args[0], message, 'ACK is being called with the original message');
  }

  test().then(() => t.end());
});

test('Not everything goes well in add function', (t: Test) => {
  const ch = mockChannel();
  const expectedResponse = Buffer.from('{}');
  const errorResponse = Buffer.concat([Buffer.from([0x1]), Buffer.from('{"error":"Unexpected error"}')]);
  async function test() {
    const pattern = 'simple.test.fails';
    const add = await setupAdd({...libOptions, ch });
    const implementation = () => {
      throw new Error();
    };

    await add({pattern, implementation});

    const consumer = ch.consume.getCall(0).args[1];

    const message = fakeMessage();
    await consumer(message);
    t.ok(ch.ack.calledOnce, 'ACK is being called');
    t.equals(ch.ack.getCall(0).args[0], message ,
      'ACK is being called with the original message.');

    t.ok(ch.sendToQueue.calledOnce, 'Sends error reply');

    t.equals(ch.sendToQueue.getCall(0).args[0], message.properties.replyTo ,
      '2nd message goes back to the sender');
    t.deepEquals(ch.sendToQueue.getCall(0).args[1].toString(), errorResponse.toString(),
      '2nd message is an error message.');
  }
  test()
    .then(() => t.end())
    .catch(console.error);
});

test('Not everything goes well in add function Custom', (t: Test) => {
  const ch = mockChannel();
  const expectedResponse = Buffer.concat([Buffer.from([0x0]), Buffer.from('{}')]);
  const customErrorResponse = Buffer.concat([Buffer.from([0x01]), Buffer.from('{"error":"Custom"}')]);
  async function test() {
    const pattern = 'simple.test.fails';
    const add = await setupAdd({ ...libOptions, ch});
    const implementation = () => Promise.reject(new Error('Custom'));
    await add({pattern, implementation});

    const consumer = ch.consume.getCall(0).args[1];
    const message = fakeMessage();
    await consumer(message);

    // Error with Custom message
    t.deepEquals(ch.sendToQueue.getCall(0).args[1].toString(), customErrorResponse.toString(),
      'Custom message has a custom content.');
  }
  test().then(() => t.end());
});
