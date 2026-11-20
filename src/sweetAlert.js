const customClass = {
  container: 'gestora-swal-container',
  popup: 'gestora-swal-popup',
  title: 'gestora-swal-title',
  htmlContainer: 'gestora-swal-message',
  actions: 'gestora-swal-actions',
  confirmButton: 'gestora-swal-confirm',
  cancelButton: 'gestora-swal-cancel',
  denyButton: 'gestora-swal-deny',
  icon: 'gestora-swal-icon',
}

export default async function showSweetAlert(options) {
  const { default: Swal } = await import('sweetalert2')
  return Swal.fire({
    ...options,
    backdrop: 'rgba(8, 10, 16, 0.72)',
    buttonsStyling: false,
    customClass,
    showClass: {
      popup: 'gestora-swal-show',
      backdrop: 'gestora-swal-backdrop-show',
      icon: 'gestora-swal-icon-show',
    },
    hideClass: {
      popup: 'gestora-swal-hide',
      backdrop: 'gestora-swal-backdrop-hide',
      icon: 'gestora-swal-icon-hide',
    },
  })
}
