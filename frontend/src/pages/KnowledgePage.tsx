import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  App as AntApp,
  Button,
  Drawer,
  Empty,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from 'antd'
import type { UploadProps } from 'antd'
import {
  BookOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { knowledgeApi } from '../services/api'

const { Text, Paragraph } = Typography
const MAX_FILE_SIZE = 10 * 1024 * 1024
const SUPPORTED_EXTENSIONS = ['.pdf', '.md', '.txt', '.html']
const SUPPORTED_MIME_TYPES = ['application/pdf', 'text/markdown', 'text/plain', 'text/html']

interface KnowledgeDocument {
  id: string
  filename: string
  title: string
  source_type: string
  uploaded_at: string
  summary: string
  vuln_types: string[]
  entry_count: number
  file_size_bytes: number
}

interface KnowledgeEntry {
  id: string
  vuln_type: string
  category: string
  content: string
  source: string
}

interface KnowledgeDocumentDetail extends KnowledgeDocument {
  knowledge_entries: KnowledgeEntry[]
}

interface KnowledgeStats {
  total_documents: number
  total_entries: number
  vuln_types_covered: string[]
  vuln_type_count: number
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function sourceTypeColor(sourceType: string) {
  const colors: Record<string, string> = {
    pdf: 'red',
    markdown: 'blue',
    text: 'green',
    html: 'orange',
  }
  return colors[sourceType] || 'default'
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return `File "${file.name}" exceeds 10MB limit (${formatFileSize(file.size)})`
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
  if (!SUPPORTED_EXTENSIONS.includes(ext) && !SUPPORTED_MIME_TYPES.includes(file.type)) {
    return `Unsupported file type "${ext}". Supported: PDF, MD, TXT, HTML`
  }
  return null
}

export default function KnowledgePage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [filterVulnType, setFilterVulnType] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null)
  const [selectedDocDetail, setSelectedDocDetail] = useState<KnowledgeDocumentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const uniqueCategories = useMemo(() => new Set(documents.flatMap(doc => doc.vuln_types)).size, [documents])
  const totalEntries = useMemo(() => documents.reduce((sum, doc) => sum + doc.entry_count, 0), [documents])

  const fetchStats = useCallback(async () => {
    try {
      const data = await knowledgeApi.getStats()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch knowledge stats:', error)
    }
  }, [])

  const fetchDocuments = useCallback(async (vulnType?: string) => {
    setLoading(true)
    try {
      if (vulnType) {
        const data = await knowledgeApi.search(vulnType)
        setDocuments(data.results || [])
      } else {
        const data = await knowledgeApi.listDocuments()
        setDocuments(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch knowledge documents:', error)
      notification.error({ message: t('knowledge.failedToFetch', 'Failed to fetch knowledge documents') })
    } finally {
      setLoading(false)
    }
  }, [notification, t])

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchDocuments(filterVulnType || undefined)])
  }, [fetchStats, fetchDocuments, filterVulnType])

  useEffect(() => {
    fetchStats()
    fetchDocuments()
  }, [fetchStats, fetchDocuments])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchAll()
    } finally {
      setRefreshing(false)
    }
  }, [fetchAll])

  const handleFilterChange = useCallback((vulnType: string) => {
    setFilterVulnType(vulnType)
    setSelectedDoc(null)
    setSelectedDocDetail(null)
    fetchDocuments(vulnType || undefined)
  }, [fetchDocuments])

  const uploadFile = useCallback(async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      notification.error({ message: validationError })
      return
    }

    setUploading(true)
    try {
      const data = await knowledgeApi.upload(file)
      notification.success({ message: data.message || `"${file.name}" uploaded and processed successfully` })
      await fetchAll()
    } catch (error: any) {
      notification.error({ message: error.response?.data?.detail || `Failed to upload "${file.name}"` })
    } finally {
      setUploading(false)
    }
  }, [fetchAll, notification])

  const uploadProps: UploadProps = {
    accept: '.pdf,.md,.txt,.html',
    showUploadList: false,
    beforeUpload: file => {
      uploadFile(file)
      return false
    },
    disabled: uploading,
  }

  const handleDelete = useCallback(async (doc: KnowledgeDocument) => {
    try {
      await knowledgeApi.deleteDocument(doc.id)
      notification.success({ message: t('knowledge.documentDeleted', 'Document deleted successfully') })
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc(null)
        setSelectedDocDetail(null)
      }
      await fetchAll()
    } catch {
      notification.error({ message: t('knowledge.deleteFailed', 'Failed to delete document') })
    }
  }, [fetchAll, notification, selectedDoc, t])

  const openDocument = useCallback(async (doc: KnowledgeDocument) => {
    setSelectedDoc(doc)
    setSelectedDocDetail(null)
    setDetailLoading(true)
    try {
      const data = await knowledgeApi.getDocument(doc.id)
      setSelectedDocDetail(data)
    } catch (error) {
      console.error('Failed to fetch document detail:', error)
      notification.error({ message: t('knowledge.detailFailed', 'Failed to fetch document detail') })
    } finally {
      setDetailLoading(false)
    }
  }, [notification, t])

  const columns: ProColumns<KnowledgeDocument>[] = [
    {
      title: t('knowledge.documents'),
      dataIndex: 'title',
      render: (_, doc) => (
        <Space direction="vertical" size={2}>
          <Space wrap>
            <Text strong>{doc.title || doc.filename}</Text>
            <Tag color={sourceTypeColor(doc.source_type)}>{doc.source_type?.toUpperCase()}</Tag>
          </Space>
          {doc.title && doc.title !== doc.filename && <Text type="secondary">{doc.filename}</Text>}
          {doc.summary && <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0, maxWidth: 560 }}>{doc.summary}</Paragraph>}
        </Space>
      ),
    },
    {
      title: t('knowledge.categories'),
      dataIndex: 'vuln_types',
      render: (_, doc) => doc.vuln_types.length ? (
        <Space size={[0, 4]} wrap>
          {doc.vuln_types.slice(0, 4).map(vt => <Tag key={vt} color="purple">{vt}</Tag>)}
          {doc.vuln_types.length > 4 && <Tag>+{doc.vuln_types.length - 4}</Tag>}
        </Space>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: t('knowledge.entries'),
      dataIndex: 'entry_count',
      width: 110,
    },
    {
      title: t('knowledge.fileSize', 'Size'),
      dataIndex: 'file_size_bytes',
      width: 120,
      render: (_, doc) => formatFileSize(doc.file_size_bytes),
    },
    {
      title: t('knowledge.uploadedAt', 'Uploaded'),
      dataIndex: 'uploaded_at',
      width: 190,
      render: (_, doc) => formatDate(doc.uploaded_at),
    },
    {
      title: t('common.actions'),
      valueType: 'option',
      width: 140,
      render: (_, doc) => [
        <Button key="view" size="small" icon={<EyeOutlined />} onClick={() => openDocument(doc)} />,
        <Popconfirm
          key="delete"
          title={t('knowledge.deleteDocument')}
          description={t('knowledge.deleteDocumentConfirm', 'Delete this knowledge document?')}
          okText={t('common.delete')}
          cancelText={t('common.cancel')}
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete(doc)}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>,
      ],
    },
  ]

  return (
    <PageContainer
      title={t('knowledge.title')}
      subTitle={t('knowledge.subtitle')}
      extra={<Button icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh}>{t('common.refresh')}</Button>}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('knowledge.documents'), value: stats?.total_documents ?? documents.length, icon: <FileTextOutlined /> }} />
          <StatisticCard statistic={{ title: t('knowledge.entries'), value: stats?.total_entries ?? totalEntries, icon: <DatabaseOutlined /> }} />
          <StatisticCard statistic={{ title: t('knowledge.categories'), value: stats?.vuln_type_count ?? uniqueCategories, icon: <BookOutlined /> }} />
        </StatisticCard.Group>

        <ProCard bordered title={<Space><CloudUploadOutlined />{t('knowledge.uploadKnowledge')}</Space>} subTitle={t('knowledge.uploadKnowledgeDesc')}>
          <Upload.Dragger {...uploadProps} style={{ padding: 24 }}>
            {uploading ? <Spin style={{ marginBottom: 16 }} /> : <CloudUploadOutlined style={{ fontSize: 48, color: '#1677ff' }} />}
            <p className="ant-upload-text">{uploading ? t('knowledge.processingDocument') : t('knowledge.dragAndDrop')}</p>
            <p className="ant-upload-hint">{t('knowledge.supportedFormats')}</p>
          </Upload.Dragger>
        </ProCard>

        <ProCard bordered>
          <Space wrap>
            <Space>
              <SearchOutlined />
              <Text>{t('knowledge.filterByVulnType')}</Text>
            </Space>
            <Select
              value={filterVulnType}
              onChange={handleFilterChange}
              style={{ minWidth: 240 }}
              options={[
                { label: t('knowledge.allVulnTypes'), value: '' },
                ...(stats?.vuln_types_covered || []).map(vt => ({ label: vt, value: vt })),
              ]}
            />
            {filterVulnType && <Button onClick={() => handleFilterChange('')}>{t('knowledge.clearFilter')}</Button>}
          </Space>
        </ProCard>

        <ProCard bordered title={`${t('knowledge.documents')} (${documents.length})`}>
          {loading ? (
            <Spin style={{ display: 'block', margin: '48px auto' }} />
          ) : documents.length === 0 ? (
            <Empty description={filterVulnType ? t('knowledge.noDocsMatchFilter') : t('knowledge.noDocsYet')}>
              {!filterVulnType && (
                <Upload {...uploadProps}>
                  <Button type="primary" icon={<CloudUploadOutlined />}>{t('knowledge.uploadFirstDoc')}</Button>
                </Upload>
              )}
            </Empty>
          ) : (
            <ProTable<KnowledgeDocument>
              rowKey="id"
              search={false}
              options={false}
              columns={columns}
              dataSource={documents}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              toolBarRender={false}
            />
          )}
        </ProCard>
      </Space>

      <Drawer
        title={selectedDoc?.title || selectedDoc?.filename || t('knowledge.documents')}
        open={Boolean(selectedDoc)}
        width={760}
        onClose={() => {
          setSelectedDoc(null)
          setSelectedDocDetail(null)
        }}
      >
        {detailLoading ? (
          <Spin style={{ display: 'block', margin: '48px auto' }} />
        ) : selectedDocDetail ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <ProCard bordered size="small">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space wrap>
                  <Tag color={sourceTypeColor(selectedDocDetail.source_type)}>{selectedDocDetail.source_type?.toUpperCase()}</Tag>
                  <Tag>{formatFileSize(selectedDocDetail.file_size_bytes)}</Tag>
                  <Tag>{selectedDocDetail.entry_count} {t('knowledge.entriesCount')}</Tag>
                </Space>
                <Text type="secondary">{selectedDocDetail.filename}</Text>
                {selectedDocDetail.summary && <Paragraph>{selectedDocDetail.summary}</Paragraph>}
                {selectedDocDetail.vuln_types.length > 0 && <Space wrap>{selectedDocDetail.vuln_types.map(vt => <Tag key={vt} color="purple">{vt}</Tag>)}</Space>}
              </Space>
            </ProCard>

            {selectedDocDetail.knowledge_entries.length === 0 ? (
              <Empty description={t('knowledge.noEntriesInDoc')} />
            ) : selectedDocDetail.knowledge_entries.map((entry, index) => (
              <ProCard key={entry.id || index} bordered size="small" title={<Space><Tag color="purple">{entry.vuln_type}</Tag><Tag>{entry.category}</Tag></Space>}>
                <Paragraph style={{ whiteSpace: 'pre-wrap' }} code>{entry.content}</Paragraph>
                {entry.source && <Text type="secondary">{t('knowledge.source')}: {entry.source}</Text>}
              </ProCard>
            ))}
          </Space>
        ) : selectedDoc ? (
          <Empty description={t('knowledge.noEntriesInDoc')} />
        ) : null}
      </Drawer>
    </PageContainer>
  )
}
