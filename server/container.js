import { db, transaction } from './database.js'
import * as security from './security.js'
import {
  sendOtp,
  sendPasswordReset,
  sendTestEmail,
  sendUserInvitation,
} from './mailer.js'
import { createAuthRepository } from './repositories/authRepository.js'
import { createAuditRepository } from './repositories/auditRepository.js'
import { createBranchesRepository } from './repositories/branchesRepository.js'
import { createDataRepository } from './repositories/dataRepository.js'
import { createInventoryRepository } from './repositories/inventoryRepository.js'
import { createOrganizationsRepository } from './repositories/organizationsRepository.js'
import { createNotificationsRepository } from './repositories/notificationsRepository.js'
import { createInvitationsRepository } from './repositories/invitationsRepository.js'
import { createRequestsRepository } from './repositories/requestsRepository.js'
import { createUsersRepository } from './repositories/usersRepository.js'
import { createAuthService } from './services/authService.js'
import { createAuditService } from './services/auditService.js'
import { createDataService } from './services/dataService.js'
import { createMigrationService } from './services/migrationService.js'
import { createProductsService } from './services/productsService.js'
import { createRequestsService } from './services/requestsService.js'
import { createUsersService } from './services/usersService.js'
import { createBranchesService } from './services/branchesService.js'
import { createOrganizationsService } from './services/organizationsService.js'
import { createNotificationsService } from './services/notificationsService.js'
import { createInvitationsService } from './services/invitationsService.js'
import { sendNotification } from './mailer.js'

export const inventoryRepository = createInventoryRepository(db)
const branchesRepository = createBranchesRepository(db)
const organizationsRepository = createOrganizationsRepository(db)
const usersRepository = createUsersRepository(db)
const invitationsRepository = createInvitationsRepository(db)
const requestsRepository = createRequestsRepository(db)
export const notificationsService = createNotificationsService({
  repository: createNotificationsRepository(db),
  sendEmail: sendNotification,
})
export const auditService = createAuditService({
  repository: createAuditRepository(db),
})
export const branchesService = createBranchesService({
  repository: branchesRepository,
  organizations: organizationsRepository,
  transaction,
  audit: auditService,
})

export const productsService = createProductsService({
  inventory: inventoryRepository,
  organizations: organizationsRepository,
  transaction,
  audit: auditService,
  notifications: notificationsService,
})
export const requestsService = createRequestsService({
  requests: requestsRepository,
  inventory: inventoryRepository,
  transaction,
  audit: auditService,
  notifications: notificationsService,
})
const dataRepository = createDataRepository(db)
export const dataService = createDataService({ repository: dataRepository })
export const migrationService = createMigrationService({
  repository: dataRepository,
  inventory: inventoryRepository,
  organizations: organizationsRepository,
  transaction,
  audit: auditService,
})
export const usersService = createUsersService({
  repository: usersRepository,
  organizations: organizationsRepository,
  invitations: invitationsRepository,
  transaction,
  hashPassword: security.hashPassword,
  audit: auditService,
})
export const organizationsService = createOrganizationsService({
  organizations: organizationsRepository,
  branches: branchesRepository,
  users: usersRepository,
  transaction,
  invitations: invitationsRepository,
  inventory: inventoryRepository,
  security,
  audit: auditService,
  sendTestEmail,
  sendInvitation: sendUserInvitation,
})
export const invitationsService = createInvitationsService({
  invitations: invitationsRepository,
  users: usersRepository,
  organizations: organizationsRepository,
  transaction,
  security,
  hashPassword: security.hashPassword,
  sendInvitation: sendUserInvitation,
  audit: auditService,
})
export const authRepository = createAuthRepository(db)
export const authService = createAuthService({
  repository: authRepository,
  transaction,
  security,
  sendOtp,
  sendPasswordReset,
  audit: auditService,
})
