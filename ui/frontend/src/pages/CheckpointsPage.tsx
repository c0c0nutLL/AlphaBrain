import { BarChartOutlined, CloudServerOutlined, CopyOutlined, DeleteOutlined, FileDoneOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, listFrom } from '../api/client';
import type { Checkpoint } from '../api/types';
import { usePreferences } from '../app-context';
import { AsyncState } from '../components/AsyncState';
import { PageIntro } from '../components/PageIntro';

function bytes(value?: number): string {
  if (value == null) return '—';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export function CheckpointsPage() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<Checkpoint>();
  const [confirmation, setConfirmation] = useState('');
  const checkpoints = useQuery({ queryKey: ['checkpoints'], queryFn: api.checkpoints, refetchInterval: 30_000 });
  const remove = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.deleteCheckpoint(id, name),
    onSuccess: async () => {
      setDeleting(undefined);
      setConfirmation('');
      message.success(t('checkpoints.deleted'));
      await queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
    },
    onError: (error) => message.error(error.message),
  });
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return listFrom(checkpoints.data).filter((item) => !term || `${item.experiment_name ?? ''} ${item.path} ${item.owner_name ?? ''}`.toLowerCase().includes(term));
  }, [checkpoints.data, search]);
  const checkpointName = (row: Checkpoint) => row.name_i18n?.[language] ?? row.experiment_name ?? row.experiment_id ?? '—';
  const deployTarget = (row: Checkpoint) => row.builtin
    ? `/deployments?create=1&checkpoint=${encodeURIComponent(row.path)}${row.combination_id ? `&combination_id=${encodeURIComponent(row.combination_id)}` : ''}&name=${encodeURIComponent(checkpointName(row))}`
    : `/deployments?create=1&checkpoint_id=${encodeURIComponent(row.id)}`;
  const evaluationTarget = (row: Checkpoint) => row.builtin
    ? `/evaluations?create=1&checkpoint=${encodeURIComponent(row.path)}${row.combination_id ? `&combination_id=${encodeURIComponent(row.combination_id)}` : ''}`
    : `/evaluations?create=1&checkpoint_id=${encodeURIComponent(row.id)}`;
  return (
    <div className="page">
      <PageIntro title={t('checkpoints.title')} subtitle={t('checkpoints.subtitle')} />
      <Card>
        <div className="table-toolbar"><Input className="table-search" allowClear prefix={<SearchOutlined />} placeholder={t('common.search')} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <AsyncState loading={checkpoints.isLoading} error={checkpoints.error} empty={!rows.length} onRetry={() => void checkpoints.refetch()}>
          <Table<Checkpoint>
            rowKey="id"
            dataSource={rows}
            scroll={{ x: 900 }}
            columns={[
              { title: t('checkpoints.experiment'), dataIndex: 'experiment_name', fixed: 'left', render: (_value: string, row) => <div><Space wrap><Typography.Text strong>{checkpointName(row)}</Typography.Text>{row.builtin ? <Tag color="geekblue">{t('checkpoints.localPreset')}</Tag> : null}{row.checkpoint_format_label_i18n?.[language] ? <Tag color={row.checkpoint_format === 'lerobot' ? 'cyan' : row.checkpoint_format === 'openpi' ? 'blue' : 'purple'}>{t('checkpoints.formatSource')} · {row.checkpoint_format_label_i18n[language]}</Tag> : null}</Space><small className="table-subtitle">{row.description_i18n?.[language] ?? row.description ?? row.owner_name}</small></div> },
              { title: t('checkpoints.step'), dataIndex: 'step', sorter: (a, b) => (a.step ?? 0) - (b.step ?? 0), render: (value?: number) => value?.toLocaleString() ?? '—' },
              { title: t('checkpoints.size'), dataIndex: 'size_bytes', render: bytes },
              { title: t('checkpoints.complete'), dataIndex: 'complete', render: (value: boolean | undefined, row) => <Space direction="vertical" size={2}><Tag icon={<FileDoneOutlined />} color={value === false ? 'red' : 'green'}>{value === false ? t('checkpoints.incomplete') : t('checkpoints.integrityOk')}</Tag>{row.builtin ? <Tag color={row.deployable ? 'green' : 'gold'}>{row.deployable ? t('checkpoints.deploymentReady') : t('checkpoints.adapterRequired')}</Tag> : null}</Space> },
              { title: t('checkpoints.resumable'), dataIndex: 'resumable', render: (value?: boolean) => value ? <Tag color="blue">{t('common.yes')}</Tag> : <Tag>{t('common.no')}</Tag> },
              { title: t('common.createdAt'), dataIndex: 'created_at', render: (value?: string) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—' },
              { title: t('checkpoints.path'), dataIndex: 'path', ellipsis: true, width: 260, render: (value: string) => <Space><Typography.Text code ellipsis={{ tooltip: value }} style={{ maxWidth: 190 }}>{value}</Typography.Text><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => { void navigator.clipboard.writeText(value); message.success(t('common.copied')); }} /></Space> },
              { title: t('common.actions'), fixed: 'right', render: (_, row) => <Space><Button size="small" onClick={() => navigate(`/checkpoints/${encodeURIComponent(row.id)}`)}>{t('common.view')}</Button><Button type="primary" ghost size="small" icon={<PlayCircleOutlined />} disabled={!row.resumable} onClick={() => navigate(`/experiments/new?checkpoint=${encodeURIComponent(row.path)}&resume_mode=full_state`)}>{t('checkpoints.resume')}</Button><Button size="small" icon={<CloudServerOutlined />} disabled={row.complete === false || row.deployable === false} onClick={() => navigate(deployTarget(row))}>{t('checkpoints.deploy')}</Button><Button size="small" icon={<BarChartOutlined />} disabled={row.complete === false || row.deployable === false} onClick={() => navigate(evaluationTarget(row))}>{t('checkpoints.evaluate')}</Button>{row.can_delete ? <Button danger type="text" size="small" icon={<DeleteOutlined />} aria-label={t('common.delete')} onClick={() => { setDeleting(row); setConfirmation(''); }} /> : null}</Space> },
            ]}
          />
        </AsyncState>
      </Card>
      <Modal
        title={t('checkpoints.deleteTitle')}
        open={Boolean(deleting)}
        okText={t('common.delete')}
        cancelText={t('common.cancel')}
        okButtonProps={{ danger: true, disabled: confirmation !== deleting?.experiment_name }}
        confirmLoading={remove.isPending}
        onCancel={() => { setDeleting(undefined); setConfirmation(''); }}
        onOk={() => { if (deleting?.experiment_name) remove.mutate({ id: deleting.id, name: confirmation }); }}
      >
        <Typography.Paragraph>{t('checkpoints.deleteWarning')}</Typography.Paragraph>
        <Typography.Paragraph><Typography.Text code>{deleting?.experiment_name}</Typography.Text></Typography.Paragraph>
        <Input
          autoFocus
          value={confirmation}
          placeholder={t('checkpoints.confirmExperimentName')}
          onChange={(event) => setConfirmation(event.target.value)}
          onPressEnter={() => {
            if (deleting?.experiment_name && confirmation === deleting.experiment_name) {
              remove.mutate({ id: deleting.id, name: confirmation });
            }
          }}
        />
      </Modal>
    </div>
  );
}
