import { c, b } from 'erte'
import NameCheapWeb from '@rqt/namecheap-web'
import { confirm } from 'reloquent'
import t from 'tablature'
import { debuglog, inspect } from 'util'
import frame from 'frame-of-mind'
import loading from 'indicatrix'

const LOG = debuglog('expensive')
const LOG_OBJ = (obj) => {
  const i = inspect(obj, { colors: true })
  LOG(i)
}

/**
 * Find a default address ID.
 * @param {!Array<_namecheap.Address>} addresses A list of addresses.
 * @returns {?number} A default address ID.
 */
export const findDefault = (addresses) => {
  const found = addresses.find(({ IsDefault }) => IsDefault)
  if (!found) return null
  return found.AddressId
}

const getCoupon = async (sandbox) => {
  const coupon = await (sandbox ? NameCheapWeb['SANDBOX_COUPON']() : NameCheapWeb['COUPON']())
  return coupon
}

const getZone = (domain) => {
  const z  = domain.split('.')
  const zone = z[z.length - 1]
  return zone
}

/**
 * @param {_namecheap.Pricing} pricing
 */
const findProduct = (pricing, zone, years) => {
  return pricing.domains
    .register[zone].find(({ Duration }) => Duration == years)
}

/**
 * @param {_namecheap.NameCheap} nc
 */
const getPrice = async (nc, zone, years, promoCode) => {
  const pp = await nc.users.getPricing({
    type: 'DOMAIN',
    promoCode,
    action: 'REGISTER',
    product: zone,
  })
  let CouponlessPrice
  if (promoCode) {
    const cp = await nc.users.getPricing({
      type: 'DOMAIN',
      action: 'REGISTER',
      product: zone,
    });
    ({ YourPrice: CouponlessPrice } = findProduct(cp, zone, years))
  }
  const price = findProduct(pp, zone, years)
  // LOG_OBJ(price)
  return {
    PromoCode: promoCode,
    AdditionalCost: price.YourAdditonalCost,
    Price: price.YourPrice,
    PriceType: price.YourPriceType,
    AdditionalCostType: price.YourAdditonalCostType,
    Currency: price.Currency,
    CouponlessPrice: CouponlessPrice,
  }
}

const getPriceWithCurrency = (currency, price) => {
  return `${price} ${currency}`
}

const findAndApplyPromo = async (promo, sandbox, zone) => {
  if (promo) {
    console.log('Using promo %s', promo)
    return promo
  }
  if (['com', 'net', 'org', 'info', 'biz'].includes(zone)) {
    try {
      const coupon = await loading(
        'Checking coupon online',
        getCoupon(sandbox),
      )
      const co = await confirm(`\rApply coupon ${coupon}?`)
      if (co) return coupon
    } catch (e) {
      console.log('Could not retrieve promo')
    }
  }
}

const confirmPremiumPrice = async ({ IsPremiumName, PremiumRegistrationPrice, EapFee }) => {
  let res = true
  if (IsPremiumName) {
    res = await confirm(`Continue with the premium registration price of ${PremiumRegistrationPrice}?`, {
      defaultYes: false,
    })
  }
  if (parseFloat(EapFee)) {
    res = res && await confirm(`Continue with the early access fee of ${EapFee}?`, {
      defaultYes: false,
    })
  }
  if (!res) throw new Error('No confirmation.')
}

const skipPrice = (Price) => {
  return Price.map((p) => {
    return {
      ...p,
      value: `SKIP-${p.value}`,
    }
  })
}

const getFixed = n => Number(n).toFixed(2)

const getTable = async (info, { nc, years, promo, zone }) => {
  const { IcannFee, PremiumRenewalPrice, PremiumTransferPrice, PremiumRegistrationPrice, IsPremiumName, EapFee } = info
  const Your = await getPrice(nc, zone, years, promo)

  const Premium = [
    { name: 'Premium Registration Price', value: PremiumRegistrationPrice,
      cost: PremiumRegistrationPrice,
    },
    ...skipPrice([
      { name: 'Premium Renewal Price', value: PremiumRenewalPrice },
      { name: 'Premium Transfer Price', value: PremiumTransferPrice },
    ]),
  ]
  const hasEap = parseFloat(EapFee) != 0
  const Eap = [{ name: 'Eap Fee', value: EapFee, cost: EapFee }]
  const CoolStoryBro = [
    ...(IsPremiumName ? Premium : []),
    ...(hasEap ? Eap : []),
  ]
  const Price = [
    { name: 'Price', value: Your.Price, cost: Your.Price },
    ...skipPrice(Your.PromoCode ? [{ name: 'Without Promo', value: Your.CouponlessPrice }] : []),
    ...(IcannFee ? [{ name: 'Icann Fee', value: IcannFee }] : []),
    ...(Your.AdditionalCost ? [{ name: 'Additional Cost', value: `${Your.AdditionalCost}`, cost: Your.AdditionalCost }] : []),
  ]
  const hasCoolStory = CoolStoryBro.length
  const Data = hasCoolStory ? [...CoolStoryBro, ...skipPrice(Price)] : Price

  const total = (hasCoolStory ? CoolStoryBro : Price).reduce((acc, { cost = 0 }) => {
    const f = parseFloat(cost)
    return acc + f
  }, 0)
  const totalPrice = getPriceWithCurrency(Your.Currency, getFixed(total))
  const Total = [
    { name: '-----', value: '-'.repeat(totalPrice.length) },
    { name: 'Total', value: totalPrice },
  ]
  const table = t({
    keys: ['name', 'value'],
    data: [...Data, ...Total],
    headings: ['Price', 'Value'],
    replacements: {
      value(value) {
        const [, val] = `${value}`.split('SKIP-')
        if (val) {
          return {
            value: c(val, 'grey'),
            length: val.length,
          }
        }
        return { value, length: value.length }
      },
    },
  }).replace(/.+\n/, '')
  return { Your, table }
}

const warnExtraPromo = (Your) => {
  if (Your.PromoCode && parseFloat(Your.Price) > parseFloat(Your.CouponlessPrice)) {
    console.log('[!] Warning: you will pay more with coupon %s than without it.', Your.PromoCode)
  }
}

/**
 * @param {!_namecheap.NameCheap} nc
 * @param {Object} options
 * @param {string} [options.domain] The domain to register.
 */
export default async function register(nc, {
  domain,
  promo,
  sandbox,
  years = 1,
}) {
  const INFO = await loading(`Confirming availability of ${domain}`,
    async () => {
      const [res] = await nc.domains.check(domain)
      return res
    })
  const { Available, EapFee, PremiumRegistrationPrice, Domain, IsPremiumName,
  } = INFO
  // LOG_OBJ(INFO)

  if (!Available) throw new Error(`Domain ${Domain} is not available.`)
  const zone = getZone(domain)

  const PROMO = await findAndApplyPromo(promo, sandbox, zone)

  const { Your, table } = await loading(`Getting ${years}-year price`, getTable(INFO, {
    nc,
    promo: PROMO,
    years,
    zone,
  }))
  console.log('\n%s', table)
  warnExtraPromo(Your)
  console.log('')

  if (IsPremiumName) {
    await confirmPremiumPrice({
      IsPremiumName,
      PremiumRegistrationPrice,
      EapFee,
    })
  }

  const address = /** @type {!_namecheap.AddressDetail} */ (await loading('Finding default address', async () => {
    const addresses = await nc.address.getList()
    const id = findDefault(addresses)
    if (!id) throw new Error('Could not find the default address.')
    const a = await nc.address.getInfo(id)
    return a
  }))

  console.log(
    '\rRegistering %s using:',
    b(domain, 'green'),
  )
  printAddress(address)
  // default no to prevent accidental enter when waiting for address promise
  const ok = await confirm('OK?', { defaultYes: false })
  if (!ok) return
  let ChargedAmount
  try {
    ({ ChargedAmount } = await loading('Registering the domain', async () => {
      return nc.domains.create(/** @type {!_namecheap.Create} */ ({
        address,
        domain,
        years,
        promo: PROMO,
        ...(IsPremiumName ? { premium: {
          IsPremiumDomain: true,
          PremiumPrice: parseFloat(PremiumRegistrationPrice),
          EapFee: parseFloat(EapFee),
        } } : {}),
      }))
    }))
  } catch (err) {
    const { props = {}, message } = err
    const { Number: N } = props
    // console.log(require('util').inspect({ Number: N, message }, { colors: true }))

    if (N == 2515610) {
      console.warn('[!] Bug: cannot register a premium with Eap.')
      console.warn(' -  Response when requesting w/out EapFee:')
      console.log('    %s', message)
    } else if (/No free connections to registry./.test(message)) {
      console.log('    %s', message)
      console.log('Please try again.')
    } else if (N == 3028166) {
      console.warn('[!] Possible Bug (e.g., after sending without Eap)')
      console.log('    %s', message)
    }

    throw err
  }

  console.log(
    'Successfully registered %s! Charged amount: $%s.',
    c(domain, 'green'),
    getFixed(ChargedAmount),
  )
}

/**
 * @param {!_namecheap.AddressDetail} address
 */
const printAddress = ({
  FirstName, LastName, Address1, Address2, City, Zip, Country, EmailAddress,
}) => {
  const s = `${FirstName} ${LastName}, ${EmailAddress}
 ${Address1}${Address2 ? `\n ${Address2}` : ''}
 ${City}
 ${Zip}, ${Country}`
  const f = frame(s)
  console.log(f)
}

/**
 * @suppress {nonStandardJsDocs}
 * @typedef {import('@rqt/namecheap')} _namecheap.NameCheap
 */
/**
 * @suppress {nonStandardJsDocs}
 * @typedef {import('@rqt/namecheap/types/typedefs/users').Pricing} _namecheap.Pricing
 */
/**
 * @suppress {nonStandardJsDocs}
 * @typedef {import('@rqt/namecheap/types/typedefs/address').Address} _namecheap.Address
 */
/**
 * @suppress {nonStandardJsDocs}
 * @typedef {import('@rqt/namecheap/types/typedefs/address').AddressDetail} _namecheap.AddressDetail
 */
/**
 * @suppress {nonStandardJsDocs}
 * @typedef {import('@rqt/namecheap/types/typedefs/domains').Create} _namecheap.Create
 */
/**
 * @suppress {nonStandardJsDocs}
 * @typedef {import('@rqt/namecheap/types/typedefs/domains').DomainCheck} _namecheap.DomainCheck
 */