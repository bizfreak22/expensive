#!/usr/bin/env node

/* eslint-disable no-console */
"use strict";

var _util = require("util");

var _argufy = _interopRequireDefault(require("argufy"));

var _africa = _interopRequireDefault(require("africa"));

var _getUsage = _interopRequireDefault(require("./get-usage"));

var _list = _interopRequireDefault(require("./list"));

var _check = _interopRequireDefault(require("./check"));

var _reg = _interopRequireDefault(require("./reg"));

var _ = require("..");

var _privateConfig = _interopRequireDefault(require("../lib/private-config"));

var _info = _interopRequireDefault(require("../lib/print/info"));

var _questions = _interopRequireWildcard(require("../questions"));

var _Namecheap = _interopRequireDefault(require("../Namecheap"));

var _handleIp = _interopRequireDefault(require("../lib/web/handle-ip"));

var _handleWhitelist = _interopRequireDefault(require("../lib/web/handle-whitelist"));

var _errors = _interopRequireDefault(require("./errors.json"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const LOG = (0, _util.debuglog)('expensive');
const DEBUG = /expensive/.test(process.env.NODE_DEBUG);
const SANDBOX = !!process.env.SANDBOX;
const {
  domains,
  help,
  init,
  version,
  info,
  sort,
  // name, expire, create
  desc,
  filter,
  type,
  pageSize,
  register,
  free,
  zones,
  whitelistIP
} = (0, _argufy.default)({
  domains: {
    command: true,
    multiple: true
  },
  version: {
    short: 'v',
    boolean: true
  },
  help: {
    short: 'h',
    boolean: true
  },
  init: {
    short: 'I',
    boolean: true
  },
  info: {
    short: 'i',
    boolean: true
  },
  // <INFO>
  sort: 's',
  // add validation to argufy
  desc: {
    short: 'd',
    boolean: true
  },
  filter: {
    short: 'f'
  },
  pageSize: {
    short: 'p'
  },
  type: 't',
  // add description to argufy, so that usage can be passed to usually
  // </INFO>
  register: {
    short: 'r',
    boolean: true
  },
  free: {
    short: 'f',
    boolean: true
  },
  zones: 'z',
  whitelistIP: {
    short: 'W',
    boolean: true
  }
});

if (version) {
  const {
    version: v
  } = require('../../package.json');

  console.log(v);
  process.exit();
}

if (help) {
  const u = (0, _getUsage.default)();
  console.log(u);
  process.exit();
}

const run = async name => {
  /** @type {string} */
  let phone;
  /** @type {string} */

  let user;

  try {
    const Auth = await (0, _.getConfig)({
      global: !SANDBOX,
      packageName: SANDBOX ? 'sandbox' : null
    });
    const {
      phone: p
    } = await (0, _privateConfig.default)(); // aws_id, aws_key,

    phone = p;
    user = Auth.ApiUser;
    await (0, _handleWhitelist.default)(whitelistIP);
    const nc = new _Namecheap.default(Auth);

    if (!domains) {
      await (0, _list.default)(nc, {
        sort,
        desc,
        filter,
        type,
        pageSize
      });
      return;
    }

    const [domain] = domains;

    if (info) {
      const i = await nc.domains.getInfo({
        domain
      });
      (0, _info.default)(i);
      return;
    }

    if (register) {
      await (0, _reg.default)(nc, {
        domain
      });
      return;
    }

    await (0, _check.default)(nc, {
      domains,
      zones,
      free
    });
  } catch ({
    stack,
    message,
    props
  }) {
    if (props) {
      LOG((0, _util.inspect)(props, {
        colors: true
      }));
      LOG(_errors.default[props.Number]);
    }

    const ip = await (0, _handleIp.default)({
      message,
      phone,
      user,
      name,
      props
    });

    if (ip) {
      run(name);
      return;
    }

    DEBUG ? LOG(stack) : console.error(message);
    process.exit(1);
  }
};

const getAppName = () => {
  const e = `${process.env.SANDBOX ? 'sandbox-' : ''}expensive`;
  return e;
};

const initConfig = async name => {
  const Auth = await (0, _africa.default)(name, _questions.default, {
    force: true
  });
  const client = await (0, _africa.default)(`${name}-client`, _questions.privateQuestions, {
    force: true
  });
  return {
    Auth,
    client
  };
};

(async () => {
  const name = getAppName();

  if (init) {
    await initConfig(name);
    return;
  }

  await run(name);
})();
//# sourceMappingURL=index.js.map