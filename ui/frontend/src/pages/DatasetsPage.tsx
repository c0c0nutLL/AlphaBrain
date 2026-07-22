import { DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { DatasetMixture, DatasetRegistration } from '../api/types';
import { AsyncState } from '../components/AsyncState';
import { PageIntro } from '../components/PageIntro';

function bytes(value: number) {
  if (!value) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function DatasetsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const datasets = useQuery({ queryKey: ['registered-datasets'], queryFn: api.datasets.list, refetchInterval: 5_000 });
  const mixtures = useQuery({ queryKey: ['dataset-mixtures'], queryFn: api.datasets.mixtures.list });
  const [registerOpen, setRegisterOpen] = useState(false);
  const [mixtureOpen, setMixtureOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string>();
  const preview = useQuery({ queryKey: ['dataset-preview', previewId], queryFn: () => api.datasets.preview(previewId!), enabled: Boolean(previewId) });
  const [registerForm] = Form.useForm();
  const [mixtureForm] = Form.useForm();

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['registered-datasets'] }),
    queryClient.invalidateQueries({ queryKey: ['dataset-mixtures'] }),
  ]);
  const register = useMutation({ mutationFn: api.datasets.register, onSuccess: async () => { message.success(t('datasets.registered')); setRegisterOpen(false); registerForm.resetFields(); await refresh(); }, onError: (error) => message.error(error.message) });
  const createMixture = useMutation({ mutationFn: api.datasets.mixtures.create, onSuccess: async () => { message.success(t('datasets.mixtureCreated')); setMixtureOpen(false); mixtureForm.resetFields(); await refresh(); }, onError: (error) => message.error(error.message) });
  const remove = async (row: DatasetRegistration) => {
    try { await api.datasets.remove(row.id); message.success(t('datasets.unregistered')); await refresh(); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
  };
  const removeMixture = async (row: DatasetMixture) => {
    try { await api.datasets.mixtures.remove(row.id); await refresh(); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
  };

  const datasetTable = <Table<DatasetRegistration> rowKey="id" dataSource={datasets.data ?? []} columns={[
    { title: t('datasets.name'), dataIndex: 'name', render: (value, row) => <Space direction="vertical" size={0}><Typography.Text strong>{value}</Typography.Text><Typography.Text type="secondary" ellipsis>{row.path}</Typography.Text></Space> },
    { title: t('datasets.format'), dataIndex: 'format' },
    { title: t('common.status'), dataIndex: 'status', render: (value) => <Tag color={value === 'ready' ? 'green' : value === 'invalid' ? 'red' : 'processing'}>{value}</Tag> },
    { title: t('datasets.episodes'), dataIndex: 'episode_count' },
    { title: t('datasets.size'), dataIndex: 'size_bytes', render: bytes },
    { title: t('datasets.sharing'), dataIndex: 'visibility', render: (value) => <Tag>{t(`datasets.${value}`)}</Tag> },
    { title: t('common.actions'), render: (_, row) => <Space wrap>
      <Button size="small" icon={<EyeOutlined />} disabled={row.status !== 'ready'} onClick={() => setPreviewId(row.id)}>{t('common.view')}</Button>
      <Button size="small" icon={<ReloadOutlined />} onClick={() => void api.datasets.revalidate(row.id).then(refresh)}>{t('datasets.validate')}</Button>
      <Button size="small" icon={<SettingOutlined />} disabled={row.status !== 'ready'} onClick={() => void api.datasets.stats(row.id).then(refresh)}>{t('datasets.stats')}</Button>
      <Popconfirm title={t('datasets.removeConfirm')} onConfirm={() => void remove(row)}><Button danger size="small" icon={<DeleteOutlined />}>{t('common.delete')}</Button></Popconfirm>
    </Space> },
  ]} />;

  const mixtureTable = <Table<DatasetMixture> rowKey="id" dataSource={mixtures.data ?? []} columns={[
    { title: t('datasets.name'), dataIndex: 'name' },
    { title: t('datasets.members'), render: (_, row) => row.resolved_members.map((item) => item.dataset_name ?? item.registration_id).join(', ') },
    { title: t('datasets.sharing'), dataIndex: 'visibility', render: (value) => <Tag>{t(`datasets.${value}`)}</Tag> },
    { title: t('datasets.version'), dataIndex: 'version' },
    { title: t('common.actions'), render: (_, row) => <Popconfirm title={t('datasets.removeMixtureConfirm')} onConfirm={() => void removeMixture(row)}><Button danger size="small" icon={<DeleteOutlined />}>{t('common.delete')}</Button></Popconfirm> },
  ]} />;

  return (
    <div className="page datasets-page">
      <PageIntro title={t('datasets.title')} subtitle={t('datasets.subtitle')} />
      <AsyncState loading={datasets.isLoading || mixtures.isLoading} error={datasets.error ?? mixtures.error} onRetry={() => void refresh()}>
        <Card>
          <Tabs items={[
            { key: 'datasets', label: t('datasets.registeredDatasets'), children: <><div className="table-toolbar"><Button type="primary" icon={<PlusOutlined />} onClick={() => { registerForm.setFieldsValue({ storage_mode: 'reference', visibility: 'shared', dataset_id: 'lerobot' }); setRegisterOpen(true); }}>{t('datasets.register')}</Button></div>{datasetTable}</> },
            { key: 'mixtures', label: t('datasets.mixtures'), children: <><div className="table-toolbar"><Button type="primary" icon={<PlusOutlined />} disabled={!datasets.data?.some((row) => row.status === 'ready')} onClick={() => { mixtureForm.setFieldsValue({ visibility: 'shared', members: [{ weight: 1 }] }); setMixtureOpen(true); }}>{t('datasets.createMixture')}</Button></div>{mixtureTable}</> },
          ]} />
        </Card>
      </AsyncState>
      <Modal open={registerOpen} title={t('datasets.register')} okText={t('common.confirm')} confirmLoading={register.isPending} onCancel={() => setRegisterOpen(false)} onOk={() => void registerForm.validateFields().then((values) => register.mutate(values))}>
        <Form form={registerForm} layout="vertical">
          <Form.Item name="name" label={t('datasets.name')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="path" label={t('datasets.path')} rules={[{ required: true }]} extra={t('datasets.pathHint')}><Input /></Form.Item>
          <Form.Item name="description" label={t('datasets.description')}><Input.TextArea /></Form.Item>
          <Form.Item name="storage_mode" label={t('datasets.storageMode')}><Radio.Group><Radio value="reference">{t('datasets.reference')}</Radio><Radio value="managed_copy">{t('datasets.managedCopy')}</Radio></Radio.Group></Form.Item>
          <Form.Item name="visibility" label={t('datasets.sharing')}><Radio.Group><Radio value="shared">{t('datasets.shared')}</Radio><Radio value="private">{t('datasets.private')}</Radio></Radio.Group></Form.Item>
          <Form.Item name="dataset_id" hidden><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal width={720} open={mixtureOpen} title={t('datasets.createMixture')} okText={t('common.create')} confirmLoading={createMixture.isPending} onCancel={() => setMixtureOpen(false)} onOk={() => void mixtureForm.validateFields().then((values) => createMixture.mutate(values))}>
        <Form form={mixtureForm} layout="vertical">
          <Form.Item name="name" label={t('datasets.name')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="visibility" label={t('datasets.sharing')}><Radio.Group><Radio value="shared">{t('datasets.shared')}</Radio><Radio value="private">{t('datasets.private')}</Radio></Radio.Group></Form.Item>
          <Form.List name="members">{(fields, { add, remove: removeField }) => <Space direction="vertical" className="full-width">
            {fields.map((field) => <Card size="small" key={field.key} extra={fields.length > 1 ? <Button type="text" danger onClick={() => removeField(field.name)}>{t('common.delete')}</Button> : null}>
              <Form.Item {...field} name={[field.name, 'registration_id']} label={t('datasets.dataset')} rules={[{ required: true }]}><Select options={(datasets.data ?? []).filter((row) => row.status === 'ready').map((row) => ({ value: row.id, label: row.name }))} /></Form.Item>
              <div className="form-grid-2"><Form.Item name={[field.name, 'weight']} label={t('datasets.weight')} rules={[{ required: true }]}><InputNumber min={0.0001} className="full-width" /></Form.Item><Form.Item name={[field.name, 'robot_type']} label={t('datasets.robotType')}><Input /></Form.Item></div>
            </Card>)}
            <Button block onClick={() => add({ weight: 1 })}>{t('datasets.addMember')}</Button>
          </Space>}</Form.List>
        </Form>
      </Modal>
      <Modal width={900} open={Boolean(previewId)} footer={null} title={t('datasets.preview')} onCancel={() => setPreviewId(undefined)}>
        <AsyncState loading={preview.isLoading} error={preview.error}><Descriptions bordered size="small" column={2} items={Object.entries(preview.data?.summary ?? {}).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 12).map(([key, value]) => ({ key, label: key, children: String(value) }))} /><Typography.Title level={5}>{t('datasets.sampleMetadata')}</Typography.Title><pre className="code-block">{JSON.stringify({ tasks: preview.data?.tasks, episodes: preview.data?.episodes }, null, 2)}</pre></AsyncState>
      </Modal>
    </div>
  );
}
