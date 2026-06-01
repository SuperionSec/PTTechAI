import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer } from '@ant-design/pro-components'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { menuApi } from '../../services/system'
import type { Menu, MenuCreate, MenuUpdate } from '../../services/system'

const { Text } = Typography

interface MenuFormValues {
  parent_id: string | null
  name: string
  path: string | null
  component: string | null
  icon: string | null
  sort_order: number
  permission: string | null
  is_visible: boolean
  is_active: boolean
}

// Common Ant Design icon names for selection
const ICON_OPTIONS = [
  'DashboardOutlined', 'RocketOutlined', 'RobotOutlined', 'PlusCircleOutlined',
  'ThunderboltOutlined', 'AimOutlined', 'ExperimentOutlined', 'CodeOutlined',
  'CloudServerOutlined', 'BookOutlined', 'DatabaseOutlined', 'ApiOutlined',
  'ScheduleOutlined', 'FileTextOutlined', 'TranslationOutlined', 'TeamOutlined',
  'SafetyCertificateOutlined', 'UserSwitchOutlined', 'SettingOutlined',
  'UserOutlined', 'KeyOutlined', 'ToolOutlined', 'HomeOutlined',
  'BulbOutlined', 'GlobalOutlined', 'PlayCircleOutlined', 'ClockCircleOutlined',
  'MenuOutlined', 'AppstoreOutlined', 'FolderOutlined', 'FileOutlined',
]

export default function MenuManagementPage() {
  const { t } = useTranslation()
  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null)
  const [form] = Form.useForm<MenuFormValues>()

  const fetchMenus = useCallback(async () => {
    setLoading(true)
    try {
      const data = await menuApi.tree()
      setMenus(data.menus)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to fetch menus')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    fetchMenus()
  }, [fetchMenus])

  const handleCreate = (parentId?: string | null) => {
    setEditingMenu(null)
    form.resetFields()
    form.setFieldsValue({
      parent_id: parentId ?? null,
      sort_order: 0,
      is_visible: true,
      is_active: true,
    })
    setModalVisible(true)
  }

  const handleEdit = (menu: Menu) => {
    setEditingMenu(menu)
    form.setFieldsValue({
      parent_id: menu.parent_id,
      name: menu.name,
      path: menu.path,
      component: menu.component,
      icon: menu.icon,
      sort_order: menu.sort_order,
      permission: menu.permission,
      is_visible: menu.is_visible,
      is_active: menu.is_active,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await menuApi.delete(id)
      message.success('Menu deleted')
      fetchMenus()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to delete menu')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const data: MenuCreate | MenuUpdate = {
        ...values,
        parent_id: values.parent_id || null,
        path: values.path || null,
        component: values.component || null,
        icon: values.icon || null,
        permission: values.permission || null,
      }

      if (editingMenu) {
        await menuApi.update(editingMenu.id, data as MenuUpdate)
        message.success('Menu updated')
      } else {
        await menuApi.create(data as MenuCreate)
        message.success('Menu created')
      }
      setModalVisible(false)
      fetchMenus()
    } catch (err: any) {
      if (err?.response?.data?.detail) {
        message.error(err.response.data.detail)
      }
    }
  }

  // Flatten tree for table display
  const flattenTree = (nodes: Menu[], depth = 0): (Menu & { depth: number })[] => {
    const result: (Menu & { depth: number })[] = []
    for (const node of nodes) {
      result.push({ ...node, depth })
      if (node.children?.length) {
        result.push(...flattenTree(node.children, depth + 1))
      }
    }
    return result
  }

  const tableData = flattenTree(menus)

  // Build parent options for select (exclude self and descendants)
  const getParentOptions = () => {
    const excludeId = editingMenu?.id
    const options: { label: string; value: string }[] = [
      { label: t('menu.rootMenu', 'Root Menu'), value: '' },
    ]
    const addOptions = (nodes: Menu[], prefix = '') => {
      for (const node of nodes) {
        if (node.id === excludeId) continue
        options.push({
          label: `${prefix}${node.name}`,
          value: node.id,
        })
        if (node.children?.length) {
          addOptions(node.children, `${prefix}${node.name} / `)
        }
      }
    }
    addOptions(menus)
    return options
  }

  const columns: ColumnsType<Menu & { depth: number }> = [
    {
      title: t('menu.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <span style={{ paddingLeft: record.depth * 24 }}>
          {record.depth > 0 && <span style={{ color: '#999' }}>└ </span>}
          {name}
        </span>
      ),
    },
    {
      title: t('menu.path', 'Path'),
      dataIndex: 'path',
      key: 'path',
      render: (path: string | null) => path ? <Text code>{path}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t('menu.icon', 'Icon'),
      dataIndex: 'icon',
      key: 'icon',
      width: 120,
      render: (icon: string | null) => icon ? <Tag>{icon}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: t('menu.permission', 'Permission'),
      dataIndex: 'permission',
      key: 'permission',
      width: 150,
      render: (permission: string | null) =>
        permission ? <Tag color="blue">{permission}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: t('menu.sortOrder', 'Sort'),
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80,
      align: 'center',
    },
    {
      title: t('menu.visible', 'Visible'),
      dataIndex: 'is_visible',
      key: 'is_visible',
      width: 80,
      align: 'center',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>{v ? t('common.yes', 'Yes') : t('common.no', 'No')}</Tag>
      ),
    },
    {
      title: t('menu.active', 'Active'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      align: 'center',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'red'}>{v ? t('common.yes', 'Yes') : t('common.no', 'No')}</Tag>
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleCreate(record.id)}
          >
            {t('menu.addChild', 'Add Child')}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            {t('common.edit', 'Edit')}
          </Button>
          <Popconfirm
            title={t('menu.deleteConfirm', 'Delete this menu and all children?')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {t('common.delete', 'Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer
      title={t('menuManagement.title', 'Menu Management')}
      subTitle={t('menuManagement.subtitle', 'Configure sidebar navigation menus')}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchMenus}>
          {t('common.refresh', 'Refresh')}
        </Button>,
        <Button key="create" type="primary" icon={<PlusOutlined />} onClick={() => handleCreate()}>
          {t('menu.create', 'Create Menu')}
        </Button>,
      ]}
    >
      <Card>
        <Spin spinning={loading}>
          {tableData.length === 0 ? (
            <Empty description={t('menu.empty', 'No menus configured')} />
          ) : (
            <Table
              dataSource={tableData}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="small"
              bordered
            />
          )}
        </Spin>
      </Card>

      <Modal
        title={editingMenu ? t('menu.edit', 'Edit Menu') : t('menu.create', 'Create Menu')}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical" initialValues={{ is_visible: true, is_active: true, sort_order: 0 }}>
          <Form.Item
            name="parent_id"
            label={t('menu.parent', 'Parent Menu')}
          >
            <Select
              options={getParentOptions()}
              placeholder={t('menu.selectParent', 'Select parent menu')}
              allowClear
            />
          </Form.Item>

          <Form.Item
            name="name"
            label={t('menu.name', 'Name')}
            rules={[{ required: true, message: t('menu.nameRequired', 'Menu name is required') }]}
          >
            <Input placeholder={t('menu.namePlaceholder', 'Menu display name or i18n key')} />
          </Form.Item>

          <Form.Item
            name="path"
            label={t('menu.path', 'Path')}
          >
            <Input placeholder={t('menu.pathPlaceholder', '/example/path')} />
          </Form.Item>

          <Form.Item
            name="component"
            label={t('menu.component', 'Component')}
          >
            <Input placeholder={t('menu.componentPlaceholder', 'pages/example/Page')} />
          </Form.Item>

          <Form.Item
            name="icon"
            label={t('menu.icon', 'Icon')}
          >
            <Select
              options={ICON_OPTIONS.map(icon => ({ label: icon, value: icon }))}
              placeholder={t('menu.selectIcon', 'Select icon')}
              allowClear
              showSearch
            />
          </Form.Item>

          <Form.Item
            name="permission"
            label={t('menu.permission', 'Permission')}
          >
            <Input placeholder={t('menu.permissionPlaceholder', 'e.g., scan:read')} />
          </Form.Item>

          <Form.Item
            name="sort_order"
            label={t('menu.sortOrder', 'Sort Order')}
          >
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>

          <Space size="large">
            <Form.Item
              name="is_visible"
              label={t('menu.visible', 'Visible')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name="is_active"
              label={t('menu.active', 'Active')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </PageContainer>
  )
}
