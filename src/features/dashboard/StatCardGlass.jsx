import { motion, useReducedMotion } from 'framer-motion'

function StatCardGlass({ title, value, detail, icon: Icon, index = 0 }) {
  const prefersReducedMotion = useReducedMotion()
  return (
    <motion.article
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel glass-card"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.4,
        delay: prefersReducedMotion ? 0 : index * 0.07,
        ease: 'easeOut',
      }}
      whileHover={prefersReducedMotion ? undefined : { y: -4 }}
    >
      <div className="stat-card-heading">
        <span className="stat-icon">
          <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
        </span>
        <span className="stat-indicator" aria-hidden="true" />
      </div>
      <p className="stat-title">{title}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-detail">{detail}</p>
    </motion.article>
  )
}

export default StatCardGlass
