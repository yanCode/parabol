import removeTeamsLimitObjects from '../../../billing/helpers/removeTeamsLimitObjects'
import getRethink from '../../../database/rethinkDriver'
import updateTeamByOrgId from '../../../postgres/queries/updateTeamByOrgId'
import {fromEpochSeconds} from '../../../utils/epochTime'
import setTierForOrgUsers from '../../../utils/setTierForOrgUsers'
import setUserTierForOrgId from '../../../utils/setUserTierForOrgId'
import {getStripeManager} from '../../../utils/stripe'
import {DataLoaderWorker} from '../../graphql'

const upgradeToTeamTier = async (
  orgId: string,
  paymentMethodId: string,
  email: string,
  dataLoader: DataLoaderWorker
) => {
  const r = await getRethink()
  const now = new Date()

  const organization = await r.table('Organization').get(orgId).run()
  if (!organization) throw new Error('Bad orgId')

  const quantity = await r
    .table('OrganizationUser')
    .getAll(orgId, {index: 'orgId'})
    .filter({removedAt: null, inactive: false})
    .count()
    .run()

  const manager = getStripeManager()
  const customers = await manager.getCustomersByEmail(email)
  const existingCustomer = customers.data.find((customer) => customer.metadata.orgId === orgId)
  const customer = existingCustomer ?? (await manager.createCustomer(orgId, email))
  const {id: customerId} = customer
  await manager.attachPaymentToCustomer(customerId, paymentMethodId)
  // wait until the payment is attached to the customer before updating the default payment method
  await manager.updateDefaultPaymentMethod(customerId, paymentMethodId)
  const subscription = await manager.createTeamSubscription(customer.id, orgId, quantity)
  const subscriptionFields = {
    periodEnd: fromEpochSeconds(subscription.current_period_end),
    periodStart: fromEpochSeconds(subscription.current_period_start),
    stripeSubscriptionId: subscription.id
  }

  await Promise.all([
    r({
      updatedOrg: r
        .table('Organization')
        .get(orgId)
        .update({
          ...subscriptionFields,
          tier: 'team',
          stripeId: customer.id,
          tierLimitExceededAt: null,
          scheduledLockAt: null,
          lockedAt: null,
          updatedAt: now
        })
    }).run(),
    updateTeamByOrgId(
      {
        isPaid: true,
        tier: 'team'
      },
      orgId
    ),
    removeTeamsLimitObjects(orgId, dataLoader)
  ])

  await Promise.all([setUserTierForOrgId(orgId), setTierForOrgUsers(orgId)])
}

export default upgradeToTeamTier
