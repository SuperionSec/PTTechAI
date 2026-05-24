import { Result, Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <Result
      status="404"
      title="404"
      subTitle={t('errors.notFound', 'The page you visited does not exist.')}
      extra={<Button type="primary" onClick={() => navigate('/')}>{t('common.backHome', 'Back Home')}</Button>}
    />
  )
}
