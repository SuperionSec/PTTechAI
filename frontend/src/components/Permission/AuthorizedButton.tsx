import type { ComponentProps } from 'react'
import { Button } from 'antd'
import PermissionGate from './PermissionGate'

interface AuthorizedButtonProps extends ComponentProps<typeof Button> {
  permission?: string
}

export default function AuthorizedButton({ permission, ...buttonProps }: AuthorizedButtonProps) {
  return (
    <PermissionGate permission={permission}>
      <Button {...buttonProps} />
    </PermissionGate>
  )
}
