import * as test from 'tape';
import {Test} from 'tape';
import { stub, spy } from 'sinon';
import iris from './index';
import { restartConnection } from './index';

const setupAct: any = (spy: any) => stub().returns(Promise.resolve(spy()));
const setupAdd: any = (spy: any) => stub().returns(Promise.resolve(spy()));
const _restartConnection = spy();

function mockConnect() {
  return {
    createChannel: spy(),
    on: spy()
  };
}

function wait(time: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => resolve(), time);
  });
}

function mockOpts() {
  const connectResponse = mockConnect();
  const add = spy();
  const act = spy();
  const additions = {'test': {pattern: 'test', implementation: spy()}};
  return {
    steps: {
      act,
      add,
      connectResponse
    },
    mocks: {
      url: '',
      exchange: '',
      additions,
      _setupAct: stub().returns(Promise.resolve(act)),
      _setupAdd: stub().returns(Promise.resolve(add)),
      _restartConnection: stub().returns(Promise.resolve({act, add})),
      _connect: stub().returns(Promise.resolve(connectResponse)),
      _log: {log: spy(), info: spy(), warn: spy(), error: spy()} as any
    }
  };
}

test('Test restartConnection', (t: Test) => {
  const _setup = stub().returns(Promise.resolve());

  const opts = mockOpts();
  const _setTimeout = spy();

  const url = '';
  const exchange = '';
  const result = restartConnection({opts: opts.mocks, _setup, _setTimeout});

  t.ok(result instanceof Promise, 'RestartConnection returns a promise');

  t.ok(_setTimeout.calledOnce, 'Set a timeout');
  t.notOk(opts.mocks._restartConnection.called, 'Do not iterate before timeout');
  t.notOk(_setup.called, 'Do not run setup before timeout');

  const timeoutCb = _setTimeout.getCall(0).args[0];
  timeoutCb();

  t.ok(_setup.calledOnce, 'Run setup un timeout');
  t.notOk(opts.mocks._restartConnection.called, 'Do not iterate if setup succeds');

  _setup.reset();
  _setup.returns(Promise.reject({}));

  timeoutCb();

  setTimeout(() => {
    t.ok(opts.mocks._restartConnection.calledOnce, 'Iterate if setup blows up on timeout');

    t.end();
  }, 0);

});

test('Tests setup funcion' , (t: Test) => {

  const opts = mockOpts();

  async function test() {
    const result = await iris(opts.mocks);

    t.ok(opts.steps.add.calledOnce, 'Add is being call for each one of the provided additions');

    const passAddition = opts.steps.add.getCall(0).args[0];

    t.deepEqual(opts.mocks.additions.test, passAddition, 'The addition passed to add is the expected one');

    opts.steps.add.reset();
    await result.add({pattern: '', implementation: spy()});
    t.ok(opts.steps.add.calledOnce, 'Returns an initialized add function');
    await result.act({pattern: '', payload: {}});
    t.ok(opts.steps.act.calledOnce, 'Returns an initialized act function');

    const on = opts.steps.connectResponse.on.getCall(0);

    t.equals(on && on.args[0], 'close', 'It adds a handlers to connection close');

    const add = spy();
    const act = spy();
    opts.mocks._restartConnection.returns(Promise.resolve({act, add}));

    on.args[1]();

    t.ok(opts.mocks._restartConnection.calledOnce, 'Restart connection is called on connection close');

    await wait(0); // Wait for the connection to stablish again;

    await result.add({pattern: '', implementation: spy()});
    t.ok(add.calledOnce, 'After successsfull restart add is reasigned');

    await result.act({pattern: '', payload: {}});
    t.ok(act.calledOnce, 'After successsfull restart act is reasigned');

    opts.mocks._restartConnection.returns(Promise.reject({}));

    on.args[1]();

    await result.add({pattern: '', implementation: spy()}).then(() => {
      t.ok(true, 'Add works on errored library');
    });

    await result.act({pattern: '', payload: {}})
      .then(() => {
        t.ok(false, 'Act should fail on errored library');
      })
      .catch(err => {
        t.ok(true, 'Act rejects the promise if the pipe is broken');
      });
  }

  test()
    .then(() => t.end())
    .catch(console.error);
});
