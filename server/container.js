import { db, transaction } from './database.js'
import * as security from './security.js'
import { sendOtp } from './mailer.js'
import { createAuthRepository } from './repositories/authRepository.js'
import { createDataRepository } from './repositories/dataRepository.js'
import { createInventoryRepository } from './repositories/inventoryRepository.js'
import { createRequestsRepository } from './repositories/requestsRepository.js'
import { createUsersRepository } from './repositories/usersRepository.js'
import { createAuthService } from './services/authService.js'
import { createDataService } from './services/dataService.js'
import { createMigrationService } from './services/migrationService.js'
import { createProductsService } from './services/productsService.js'
import { createRequestsService } from './services/requestsService.js'
import { createUsersService } from './services/usersService.js'

export const inventoryRepository = createInventoryRepository(db)
const requestsRepository = createRequestsRepository(db)

export const productsService = createProductsService({
  inventory: inventoryRepository,
  transaction,
})
export const requestsService = createRequestsService({
  requests: requestsRepository,
  inventory: inventoryRepository,
  transaction,
})
const dataRepository = createDataRepository(db)
export const dataService = createDataService({ repository: dataRepository })
export const migrationService = createMigrationService({
  repository: dataRepository,
  inventory: inventoryRepository,
  transaction,
})
export const usersService = createUsersService({
  repository: createUsersRepository(db),
  transaction,
  hashPassword: security.hashPassword,
})
export const authRepository = createAuthRepository(db)
export const authService = createAuthService({
  repository: authRepository,
  transaction,
  security,
  sendOtp,
})
