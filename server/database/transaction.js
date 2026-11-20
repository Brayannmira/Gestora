export function createTransaction(database) {
  return (callback) => {
    database.exec('BEGIN IMMEDIATE')
    try {
      const result = callback()
      database.exec('COMMIT')
      return result
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}
