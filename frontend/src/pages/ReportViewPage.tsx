import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard } from '@ant-design/pro-components'
import { Button, Space, Spin, Typography } from 'antd'
import {
  ArrowsAltOutlined,
  CloudDownloadOutlined,
  ExportOutlined,
  FileTextOutlined,
  ReloadOutlined,
  ShrinkOutlined,
} from '@ant-design/icons'
import { reportsApi } from '../services/api'

const { Text } = Typography

export default function ReportViewPage() {
  const { reportId } = useParams<{ reportId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  useEffect(() => {
    if (!reportId) {
      navigate('/reports')
      return
    }
    setIsLoading(false)
  }, [reportId, navigate])

  const handleRefresh = useCallback(() => {
    setIframeKey(key => key + 1)
  }, [])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(fullscreen => !fullscreen)
  }, [])

  if (isLoading || !reportId) {
    return (
      <PageContainer title={t('reportView.loadingReport')}>
        <ProCard bordered>
          <Spin style={{ display: 'block', margin: '64px auto' }} />
        </ProCard>
      </PageContainer>
    )
  }

  const actions = [
    <Button key="refresh" icon={<ReloadOutlined />} onClick={handleRefresh} title={t('reportView.refreshReport')} />,
    <Button
      key="fullscreen"
      icon={isFullscreen ? <ShrinkOutlined /> : <ArrowsAltOutlined />}
      onClick={toggleFullscreen}
      title={t('reportView.toggleFullscreen')}
    />,
    <Button key="html" icon={<CloudDownloadOutlined />} onClick={() => window.open(reportsApi.getDownloadUrl(reportId, 'html'), '_blank')}>
      HTML
    </Button>,
    <Button key="json" icon={<CloudDownloadOutlined />} onClick={() => window.open(reportsApi.getDownloadUrl(reportId, 'json'), '_blank')}>
      JSON
    </Button>,
    <Button key="new-tab" type="primary" icon={<ExportOutlined />} onClick={() => window.open(reportsApi.getViewUrl(reportId), '_blank')}>
      {t('reportView.newTab')}
    </Button>,
  ]

  if (isFullscreen) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', padding: 16 }}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Button onClick={() => navigate('/reports')}>{t('reportView.backToReports')}</Button>
          {actions}
        </Space>
        <iframe
          key={iframeKey}
          src={reportsApi.getViewUrl(reportId)}
          style={{ width: '100%', height: 'calc(100vh - 64px)', border: 0 }}
          title="Report"
        />
      </div>
    )
  }

  return (
    <PageContainer
      title={t('reportView.title', 'Report View')}
      subTitle={<Space><FileTextOutlined /><Text code>{reportId}</Text></Space>}
      onBack={() => navigate('/reports')}
      extra={actions}
    >
      <ProCard bordered bodyStyle={{ padding: 0, overflow: 'hidden' }}>
        <iframe
          key={iframeKey}
          src={reportsApi.getViewUrl(reportId)}
          style={{ width: '100%', height: 'calc(100vh - 260px)', minHeight: 560, border: 0 }}
          title="Report"
        />
      </ProCard>
    </PageContainer>
  )
}
