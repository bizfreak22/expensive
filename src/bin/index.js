#!/usr/bin/env node
/* eslint-disable no-console */
import { debuglog, inspect } from 'util'
import argufy from 'argufy'
import africa from 'africa'
import getUsage from './get-usage'
import List from './list'
import Check from './check'
import Register from './reg'
import { getConfig } from '..'
import getPrivateConfig from '../lib/private-config'
import printInfo from '../lib/print/info'
import questions, { privateQuestions } from '../questions'
import Namecheap from '../Namecheap'
import handleIp from '../lib/web/handle-ip'
import handleWhitelist from '../lib/web/handle-whitelist'
import Errors from './errors.json'

const LOG = debuglog('expensive')
const DEBUG = /expensive/.test(process.env.NODE_DEBUG)
const SANDBOX = !!process.env.SANDBOX

const {
  domains,
  help,
  init,
  version,
  info,
  sort, // name, expire, create
  desc,
  filter,
  type,
  pageSize,
  register,
  free,
  zones,
  whitelistIP,
} = argufy({
  domains: {
    command: true,
    multiple: true,
  },
  version: {
    short: 'v',
    boolean: true,
  },
  help: { short: 'h', boolean: true },
  init: { short: 'I', boolean: true },
  info: { short: 'i', boolean: true },
  // <INFO>
  sort: 's', // add validation to argufy
  desc: { short: 'd', boolean: true },
  filter: { short: 'f' },
  pageSize: { short: 'p' },
  type: 't', // add description to argufy, so that usage can be passed to usually
  // </INFO>
  register: { short: 'r', boolean: true },
  free: { short: 'f', boolean: true },
  zones: 'z',
  whitelistIP: { short: 'W', boolean: true },
})

if (version) {
  const { version: v } = require('../../package.json')
  console.log(v)
  process.exit()
}

if (help) {
  const u = getUsage()
  console.log(u)
  process.exit()
}

const run = async (name) => {
  /** @type {string} */
  let phone
  /** @type {string} */
  let user
  try {
    const Auth = await getConfig({
      global: !SANDBOX,
      packageName: SANDBOX ? 'sandbox' : null,
    })
    const { phone: p } = await getPrivateConfig() // aws_id, aws_key,
    phone = p
    user = Auth.ApiUser

    await handleWhitelist(whitelistIP)

    const nc = new Namecheap(Auth)

    if (!domains) {
      await List(nc, { sort, desc, filter, type, pageSize })
      return
    }

    const [domain] = domains

    if (info) {
      const i = await nc.domains.getInfo({ domain })
      printInfo(i)
      return
    }

    if (register) {
      await Register(nc, { domain })
      return
    }

    await Check(nc, {
      domains,
      zones,
      free,
    })
  } catch ({ stack, message, props }) {
    if (props) {
      LOG(inspect(props, { colors: true }))
      LOG(Errors[props.Number])
    }

    const ip = await handleIp({
      message,
      phone,
      user,
      name,
      props,
    })
    if (ip) {
      run(name)
      return
    }

    DEBUG ? LOG(stack) : console.error(message)
    process.exit(1)
  }
}

const getAppName = () => {
  const e = `${process.env.SANDBOX ? 'sandbox-' : ''}expensive`
  return e
}

const initConfig = async (name) => {
  const Auth = await africa(name, questions, { force: true })
  const client = await africa(`${name}-client`, privateQuestions, { force: true })
  return {
    Auth,
    client,
  }
}

; (async () => {
  const name = getAppName()
  if (init) {
    await initConfig(name)
    return
  }
  await run(name)
})()
