import { spawn } from 'child_process'

const isFunction = maybeFunction => typeof maybeFunction === 'function';

const expectedStderrForAction = {
  'cms.verify': /^verification successful/i,
  'genrsa': /^generating/i,
  'pkcs12': /^mac verified ok/i,
  'req.new': /^generating/i,
  'req.verify': /^verify ok/i,
  'rsa': /^writing rsa key/i,
  'smime.verify': /^verification successful/i,
  'x509.req': /^signature ok/i
}

export default function exec(action, maybeBuffer, maybeOptions, maybeCallback) {
  // Support option re-ordering
  let
    buffer = maybeBuffer,
    options = maybeOptions,
    callback = maybeCallback
  if (!Buffer.isBuffer(buffer)) {
    callback = options;
    options = buffer;
    buffer = false;
  }
  if (isFunction(options)) {
    callback = options;
    options = {};
  }

  // Build initial params with passed action
  let params = action.split('.').map((value, key) => (!key ? value : `-${value}`));
  const lastParams = [];
  for (const [key, value] of Object.entries(options)) {
    switch (value) {
      case false: lastParams.push(key); break
      case true: params.push(`-${key}`); break
      default: {
        let itr = (
          typeof value === "object"
          || typeof value === "function"
          ? value[Symbol.iterator] : void 0
        )
        if (typeof itr !== "function") {
          params.push(`${key}`, value);
        } else for (const itrValue of itr.call(value)) {
          params.push(`-${key}`, itrValue);
        }
      }
    }
  }
  // Append last params
  params = params.concat(lastParams);

  // Actually spawn openssl command
  const
    openssl = spawn('openssl', params),
    outResult = [], errResult = []
  let outLength = 0, errLength = 0;

  openssl.stdout.on('data', data => {
    outLength += data.length
    outResult.push(data)
  })

  openssl.stderr.on('data', data => {
    errLength += data.length
    errResult.push(data)
  })

  openssl.on('close', code => {
    const
      stdout = Buffer.concat(outResult, outLength),
      stderr = Buffer.concat(errResult, errLength).toString('utf8'),
      expectedStderr = expectedStderrForAction[action]
    let err = null

    if (code || (stderr && expectedStderr && !stderr.match(expectedStderr))) {
      err = new Error(stderr)
      err.code = code
    }

    if (isFunction(callback)) {
      callback.apply(null, [err, stdout])
    }
  })

  if (buffer) {
    openssl.stdin.write(buffer)
  }

  openssl.stdin.end()

  return openssl
}

export { exec }
