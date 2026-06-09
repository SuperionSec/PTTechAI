import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  App as AntApp,
  Button,
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
  Tag,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { menuApi, systemApi } from '../../services/system'
import type { Menu, MenuCreate, MenuUpdate, Permission } from '../../services/system'

const { Text } = Typography

interface MenuFormValues {
  parent_id: string | null
  name: string
  path: string | null
  component: string | null
  icon: string | null
  menu_type: string
  sort_order: number
  permission: string | null
  is_visible: boolean
  is_active: boolean
}

const ICON_OPTIONS = [
  'DashboardOutlined', 'RocketOutlined', 'RobotOutlined', 'PlusCircleOutlined',
  'ThunderboltOutlined', 'AimOutlined', 'ExperimentOutlined', 'CodeOutlined',
  'CloudServerOutlined', 'BookOutlined', 'DatabaseOutlined', 'ApiOutlined',
  'ScheduleOutlined', 'FileTextOutlined', 'TranslationOutlined', 'TeamOutlined',
  'SafetyCertificateOutlined', 'UserSwitchOutlined', 'SettingOutlined',
  'UserOutlined', 'KeyOutlined', 'ToolOutlined', 'HomeOutlined',
  'BulbOutlined', 'GlobalOutlined', 'PlayCircleOutlined', 'ClockCircleOutlined',
  'MenuOutlined', 'AppstoreOutlined', 'FolderOutlined', 'FileOutlined',
  'BugOutlined',
]

function countMenus(nodes: Menu[]): { total: number; visible: number; hidden: number } {
  let total = 0
  let visible = 0
  const walk = (list: Menu[]) => {
    for (const node of list) {
      total++
      if (node.is_visible) visible++
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return { total, visible, hidden: total - visible }
}

export default function MenuManagementPage() {
  const { t } = useTranslation()
  const { notification } = AntApp.useApp()
  const [menus, setMenus] = useState<Menu[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null)
  const [form] = Form.useForm<MenuFormValues>()

  const fetchMenus = useCallback(async () => {
    setLoading(true)
    try {
      const [treeData, permData] = await Promise.all([menuApi.tree(), systemApi.permissions()])
      setMenus(treeData.menus)
      setPermissions(permData)
    } catch (err: any) {
      notification.error({
        message: err?.response?.data?.detail || t('menu.fetchFailed', 'Failed to fetch menus'),
      })
    } finally {
      setLoading(false)
    }
  }, [t, notification])

  useEffect(() => { fetchMenus() }, [fetchMenus])

  const handleCreate = (parentId?: string | null) => {
    setEditingMenu(null)
    form.resetFields()
    form.setFieldsValue({ parent_id: parentId ?? null, menu_type: 'menu', sort_order: 0, is_visible: true, is_active: true })
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
      menu_type: menu.menu_type || 'menu',
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
      notification.success({ message: t('menu.deleteSuccess', 'Menu deleted') })
      fetchMenus()
    } catch (err: any) {
      notification.error({ message: err?.response?.data?.detail || t('menu.deleteFailed', 'Failed to delete menu') })
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
        notification.success({ message: t('menu.updateSuccess', 'Menu updated') })
      } else {
        await menuApi.create(data as MenuCreate)
        notification.success({ message: t('menu.createSuccess', 'Menu created') })
      }
      setModalVisible(false)
      fetchMenus()
    } catch (err: any) {
      if (err?.response?.data?.detail) {
        notification.error({ message: err.response.data.detail })
      }
    }
  }

  const getParentOptions = () => {
    const excludeId = editingMenu?.id
    const options: { label: string; value: string }[] = [{ label: t('menu.rootMenu', 'Root Menu'), value: '' }]
    const addOptions = (nodes: Menu[], prefix = '') => {
      for (const node of nodes) {
        if (node.id === excludeId) continue
        options.push({ label: `${prefix}${node.name}`, value: node.id })
        if (node.children?.length) addOptions(node.children, `${prefix}${node.name} / `)
      }
    }
    addOptions(menus)
    return options
  }

  const stats = countMenus(menus)

  const columns: ProColumns<Menu>[] = [
    {
      title: t('menu.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => <Text strong>{t(record.name, record.name)}</Text>,
    },
    {
      title: t('menu.path', 'Path'),
      dataIndex: 'path',
      key: 'path',
      width: 200,
      render: (_, record) => record.path ? <Text code>{record.path}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t('menu.icon', 'Icon'),
      dataIndex: 'icon',
      key: 'icon',
      width: 140,
      render: (_, record) => record.icon ? <Tag>{record.icon}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: t('menu.menuType', 'Type'),
      dataIndex: 'menu_type',
      key: 'menu_type',
      width: 100,
      render: (_, record) => {
        const typeMap: Record<string, { color: string; label: string }> = {
          directory: { color: 'blue', label: t('menu.typeDirectory', 'Directory') },
          menu: { color: 'green', label: t('menu.typeMenu', 'Menu') },
        }
        const info = typeMap[record.menu_type || 'menu'] || typeMap.menu
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: t('menu.permission', 'Permission'),
      dataIndex: 'permission',
      key: 'permission',
      width: 160,
      render: (_, record) => record.permission ? <Tag color="blue">{record.permission}</Tag> : <Text type="secondary">-</Text>,
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
      width: 90,
      align: 'center',
      render: (_, record) => (
        <Tag color={record.is_visible ? 'green' : 'default'} icon={record.is_visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}>
          {record.is_visible ? t('common.yes', 'Yes') : t('common.no', 'No')}
        </Tag>
      ),
    },
    {
      title: t('menu.active', 'Active'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 90,
      align: 'center',
      render: (_, record) => <Tag color={record.is_active ? 'green' : 'red'}>{record.is_active ? t('common.yes', 'Yes') : t('common.no', 'No')}</Tag>,
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleCreate(record.id)}>
            {t('menu.addChild', 'Child')}
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            {t('common.edit', 'Edit')}
          </Button>
          <Popconfirm
            title={t('menu.deleteConfirm', 'Delete this menu and all children?')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>{t('common.delete', 'Delete')}</Button>
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
        <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchMenus}>{t('common.refresh', 'Refresh')}</Button>,
        <Button key="create" type="primary" icon={<PlusOutlined />} onClick={() => handleCreate()}>{t('menu.create', 'Create Menu')}</Button>,
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: t('menu.totalMenus', 'Total'), value: stats.total }} />
          <StatisticCard statistic={{ title: t('menu.visibleMenus', 'Visible'), value: stats.visible, status: 'success' }} />
          <StatisticCard statistic={{ title: t('menu.hiddenMenus', 'Hidden'), value: stats.hidden, status: stats.hidden ? 'default' : 'success' }} />
        </StatisticCard.Group>

        <ProCard bordered>
          <Spin spinning={loading}>
            {menus.length === 0 ? (
              <Empty description={t('menu.empty', 'No menus configured')} />
            ) : (
              <ProTable<Menu>
                rowKey="id"
                columns={columns}
                dataSource={menus}
                search={false}
                options={false}
                pagination={false}
                expandable={{
                  childrenColumnName: 'children',
                  defaultExpandAllRows: true,
                }}
                size="small"
              />
            )}
          </Spin>
        </ProCard>
      </Space>

      <Modal
        title={editingMenu ? t('menu.edit', 'Edit Menu') : t('menu.create', 'Create Menu')}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical" initialValues={{ menu_type: 'menu', is_visible: true, is_active: true, sort_order: 0 }}>
          <Form.Item name="parent_id" label={t('menu.parent', 'Parent Menu')}>
            <Select options={getParentOptions()} placeholder={t('menu.selectParent', 'Select parent menu')} allowClear />
          </Form.Item>

          <Form.Item name="name" label={t('menu.name', 'Name')} rules={[{ required: true, message: t('menu.nameRequired', 'Menu name is required') }]}>
            <Input placeholder={t('menu.namePlaceholder', 'Menu display name or i18n key')} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.name !== cur.name}>
            {({ getFieldValue }) => {
              const name = getFieldValue('name')
              return name ? (
                <div style={{ marginTop: -12, marginBottom: 12 }}>
                  <Text type="secondary">{t('menu.displayPreview', 'Display preview')}: </Text>
                  <Text>{String(t(name, name))}</Text>
                </div>
              ) : null
            }}
          </Form.Item>

          <Form.Item name="path" label={t('menu.path', 'Path')}>
            <Input placeholder={t('menu.pathPlaceholder', '/example/path')} />
          </Form.Item>

          <Form.Item name="component" label={t('menu.component', 'Component')}>
            <Input placeholder={t('menu.componentPlaceholder', 'pages/example/Page')} />
          </Form.Item>

          <Form.Item name="icon" label={t('menu.icon', 'Icon')}>
            <Select options={[...new Set(ICON_OPTIONS)].map(icon => ({ label: icon, value: icon }))} placeholder={t('menu.selectIcon', 'Select icon')} allowClear showSearch />
          </Form.Item>

          <Form.Item name="menu_type" label={t('menu.menuType', 'Type')} rules={[{ required: true, message: t('menu.menuTypeRequired', 'Menu type is required') }]}>
            <Select
              options={[
                { label: t('menu.typeDirectory', 'Directory'), value: 'directory' },
                { label: t('menu.typeMenu', 'Menu'), value: 'menu' },
              ]}
              placeholder={t('menu.selectMenuType', 'Select menu type')}
            />
          </Form.Item>

          <Form.Item name="permission" label={t('menu.permission', 'Permission')}>
            <Select options={permissions.map(p => ({ label: p.name, value: p.name }))} placeholder={t('menu.permissionPlaceholder', 'e.g., scan:read')} allowClear showSearch />
          </Form.Item>

          <Form.Item name="sort_order" label={t('menu.sortOrder', 'Sort Order')}>
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>

          <Space size="large">
            <Form.Item name="is_visible" label={t('menu.visible', 'Visible')} valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="is_active" label={t('menu.active', 'Active')} valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </PageContainer>
  )
}
