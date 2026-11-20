import express from 'express'
import { branchesService } from '../container.js'
import {
  HttpError,
  requireAuth,
  requireManager,
  requireText,
} from '../shared/http.js'

const router = express.Router()

router.get('/', requireAuth, (request, response) => {
  response.json({ branches: branchesService.list(request.user) })
})

router.post('/', requireAuth, requireManager, (request, response, next) => {
  try {
    const name = requireText(request.body?.name, 'El nombre de la sucursal', 100)
    if (!name) throw new HttpError(400, 'Escribe un nombre de sucursal.')
    response.status(201).json({
      branch: branchesService.create({ name, actor: request.user }),
    })
  } catch (error) {
    next(error)
  }
})

export default router
