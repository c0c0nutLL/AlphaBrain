import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, RocketOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Modal, Radio, Space, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, listFrom } from '../api/client';
import type { Template } from '../api/types';
import { usePreferences } from '../app-context';
import { AsyncState } from '../components/AsyncState';
import { PageIntro } from '../components/PageIntro';
import { ResizableTable as Table } from '../components/ResizableTable';

interface TemplateForm {
  name: string;
  description?: string;
  visibility: 'personal' | 'shared';
}

export function TemplatesPage() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template>();
  const [cloning, setCloning] = useState<Template>();
  const [form] = Form.useForm<TemplateForm>();
  const me = useQuery({ queryKey: ['me'], queryFn: api.auth.me });
  const templates = useQuery({ queryKey: ['templates'], queryFn: api.templates.list });
  const save = useMutation({
    mutationFn: (values: TemplateForm) => editing
      ? api.templates.update(editing.id, values)
      : api.templates.create({ ...values, spec: cloning?.spec }),
    onSuccess: async () => {
      setOpen(false);
      setEditing(undefined);
      setCloning(undefined);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (error) => message.error(error.message),
  });
  const remove = useMutation({
    mutationFn: api.templates.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
    onError: (error) => message.error(error.message),
  });
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return listFrom(templates.data).filter((item) => !term || `${item.name} ${item.name_i18n?.['en-US'] ?? ''} ${item.description ?? ''} ${(item.tags ?? []).join(' ')} ${item.owner_name ?? ''}`.toLowerCase().includes(term));
  }, [search, templates.data]);
  const localizedName = (item: Template) => item.name_i18n?.[language] ?? item.name;
  const localizedDescription = (item: Template) => item.description_i18n?.[language] ?? item.description;

  const edit = (template: Template) => {
    setEditing(template);
    setCloning(undefined);
    form.setFieldsValue({ name: template.name, description: template.description, visibility: template.visibility });
    setOpen(true);
  };
  const canMutate = (template: Template) => Boolean(
    !template.builtin && me.data && (me.data.role === 'administrator' || (template.owner_id && me.data.id === template.owner_id)),
  );

  return (
    <div className="page">
      <PageIntro title={t('templates.title')} subtitle={t('templates.subtitle')} actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/experiments/new')}>{t('templates.create')}</Button>} />
      <Card>
        <div className="table-toolbar"><Input className="table-search" allowClear prefix={<SearchOutlined />} placeholder={t('common.search')} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <AsyncState loading={templates.isLoading} error={templates.error} empty={!rows.length} onRetry={() => void templates.refetch()}>
          <Table<Template>
            rowKey="id"
            dataSource={rows}
            columns={[
              { title: t('templates.name'), dataIndex: 'name', render: (_: string, row) => <div><Space wrap><Typography.Text strong>{localizedName(row)}</Typography.Text>{row.builtin ? <Tag color="geekblue">{t('templates.builtin')}</Tag> : null}{row.availability ? <Tag color={row.availability === 'ready' ? 'green' : row.availability === 'partial' ? 'gold' : 'red'}>{t(`templates.availability.${row.availability}`)}</Tag> : null}</Space><small className="table-subtitle">{localizedDescription(row)}</small><Space size={[4, 4]} wrap>{row.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space></div> },
              { title: t('templates.visibility'), dataIndex: 'visibility', render: (value, row) => <Tag color={row.builtin ? 'geekblue' : value === 'shared' ? 'blue' : 'default'}>{row.builtin ? t('templates.builtin') : t(`templates.${value}`)}</Tag> },
              { title: t('builder.backbone'), dataIndex: 'architecture', responsive: ['md'] },
              { title: t('builder.method'), dataIndex: 'method', responsive: ['lg'] },
              { title: t('common.owner'), dataIndex: 'owner_name', responsive: ['md'] },
              { title: t('templates.version'), dataIndex: 'version', render: (value?: number) => `v${value ?? 1}`, responsive: ['lg'] },
              { title: t('common.updatedAt'), dataIndex: 'updated_at', render: (value?: string) => value ? dayjs(value).format('MM-DD HH:mm') : '—', responsive: ['xl'] },
              {
                title: t('common.actions'), width: 230,
                render: (_, row) => (
                  <Space size="small">
                    <Button type="primary" ghost size="small" icon={<RocketOutlined />} onClick={() => navigate(`/experiments/new?template=${encodeURIComponent(row.id)}`)}>{t('templates.use')}</Button>
                    {canMutate(row) ? <Button type="text" size="small" aria-label={t('common.edit')} icon={<EditOutlined />} onClick={() => edit(row)} /> : null}
                    <Button type="text" size="small" aria-label={t('common.copy')} icon={<CopyOutlined />} onClick={() => { setEditing(undefined); setCloning(row); form.setFieldsValue({ name: t('builder.copyName', { name: localizedName(row) }), description: localizedDescription(row), visibility: 'personal' }); setOpen(true); }} />
                    {canMutate(row) ? <Button danger type="text" size="small" aria-label={t('common.delete')} icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: t('common.delete'), content: row.name, okButtonProps: { danger: true }, onOk: () => remove.mutate(row.id) })} /> : null}
                  </Space>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <Modal
        title={editing ? t('common.edit') : t('templates.create')}
        open={open}
        onCancel={() => setOpen(false)}
        okText={t('common.save')}
        confirmLoading={save.isPending}
        onOk={() => form.submit()}
      >
        <Form<TemplateForm> form={form} layout="vertical" initialValues={{ visibility: 'personal' }} onFinish={(values) => save.mutate(values)}>
          <Form.Item name="name" label={t('templates.name')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label={t('builder.description')}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="visibility" label={t('templates.visibility')} rules={[{ required: true }]}><Radio.Group options={[{ label: t('templates.personal'), value: 'personal' }, { label: t('templates.shared'), value: 'shared' }]} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
