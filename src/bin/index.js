#!/usr/bin/env node
/* eslint-disable no-console */
import { c } from 'erte'
import { debuglog, inspect } from 'util'
import { askSingle } from 'reloquent'
import argufy from 'argufy'
import getUsage from './get-usage'
import { getConfig, checkDomains } from '..'
import getPrivateConfig from '../lib/private-config'
import { makeStartupyList, isSingleWord } from '../lib'
import authenticate from '../lib/authenticate'
import { launch } from 'chrome-launcher'
// import { homedir } from 'os'
// import { resolve } from 'path'
import africa from 'africa'
import questions from '../questions'

const LOG = debuglog('expensive')
const DEBUG = /expensive/.test(process.env.NODE_DEBUG)

const {
  domain,
  help,
  init,
} = argufy({
  domain: {
    command: true,
  },
  help: 'h',
  init: { short: 'I', boolean: true },
}, process.argv)

if (help) {
  const u = getUsage()
  console.log(u)
  process.exit()
}

// if (domain) {
//   const u = getUsage()
//   console.log(u)
//   console.log()
//   process.exit(1)
// }

const checkSingleWord = async (word, auth) => {
  const domains = makeStartupyList(word)
  console.log('Checking %s domains: %s', domains.length, domains.join(', '))
  const res = await checkDomains({
    ...auth,
    domains,
  })
  reportFree(domains, res)
}

const reportFree = (domains, freeDomains) => {
  const [free, , total] = domains.reduce(([f, t, tt], dd) => {
    const isFree = freeDomains.some(d => d == dd)

    const it = isFree ? c(dd, 'green') : c(dd, 'red')

    return [
      isFree ? [...f, it] : f,
      isFree ? t : [...t, it],
      [...tt, it],
    ]
  }, [[], [], []])

  const percent = (free.length / total.length) * 100

  console.log('%s', total.join(', '))
  console.log('%s% are free', percent)
}

const run = async () => {
  const singleWord = isSingleWord(domain)
  let phone
  let user
  try {
    const { ...auth } = await getConfig({
      global: true,
    })
    const { aws_id, aws_key, phone: p } = await getPrivateConfig()
    phone = p
    user = auth.ApiUser
    if (singleWord) {
      await checkSingleWord(domain, auth)
      return
    }

    console.log('Checking domain %s', domain)
    const res = await checkDomains({
      ...auth,
      domain,
    })
    if (res.length) {
      console.log('%s is free', c(domain, 'green'))
    } else {
      console.log('%s is taken', c(domain, 'red'))
    }
  } catch ({ stack, message, props }) {
    if (props) {
      LOG(inspect(props, { colors: true }))
      LOG(Errors[props.Number])
    }

    if (props && props.Number == '1011150') {
      const authComplete = await handleRequestIP(message, { phone, user })
      if (authComplete === true) {
        await run()
        // update the configuration to reflect the IP
        // modify `africa` to be able to update the configuration
      } else {
        console.log(authComplete)
      }
      return
    }

    DEBUG ? LOG(stack) : console.error(message)
    process.exit(1)
  }
}

const handleRequestIP = async (message, { phone, user }) => {
  const _ip = /Invalid request IP: (.+)/.exec(message)
  if (!_ip) throw new Error('Could not extract IP from the error message')
  const [, ip] = _ip
  const [password, chrome] = await Promise.all([
    askSingle({
      text: `Enter password to white-list ${ip}`,
    }),
    launch({
      startingUrl: 'https://www.namecheap.com/myaccount/login.aspx',
      chromeFlags: [
        // userDataDir,
        // '--headless', '--disable-gpu', '--window-size=1000,2000'
      ],
    }),
  ])

  const res = await authenticate({
    user,
    password,
    ip,
    phone,
    chrome,
  })
  return res
}

const Errors = {
  1011150: 'Parameter RequestIP is invalid',
}

; (async () => {
  if (init) {
    await africa('expensive', questions, { force: true })
  } else {
    await run()
  }
})()
