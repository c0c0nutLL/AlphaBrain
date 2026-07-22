import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, listFrom } from '../api/client';
import type { Workload } from '../api/types';
import { AsyncState } from '../components/AsyncState';
import { PageIntro } from '../components/PageIntro';

const kinds: Workload['kind'][] = ['training', 'deployment', 'evaluation', 'utility'];

export function WorkloadsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<Workload['kind']>();
  const [status, setStatus] = useState<string>();
  const query = useQuery({ queryKey: ['workloads'], queryFn: () => api.workloads.list(), refetchInterval: 5_000 });
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return listFrom(query.data).filter((item) => (
      (!kind || item.kind === kind)
      && (!status || item.status === status)
      && (!term || `${item.name} ${item.owner_name ?? ''} ${item.subtype ?? ''}`.toLowerCase().includes(term))
    ));
  }, [kind, query.data, search, status]);
  return (
    <div className="page">
      <PageIntro title={t('workloads.title')} subtitle={t('workloads.subtitle')} />
      <Card>
        <div className="table-toolbar">
          <Space wrap>
            <Input allowClear prefix={<SearchOutlined />} placeholder={t('common.search')} value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select allowClear placeholder={t('workloads.kind')} value={kind} onChange={setKind} options={kinds.map((value) => ({ value, label: t(`workloads.kinds.${value}`) }))} />
            <Select allowClear placeholder={t('common.status')} value={status} onChange={setStatus} options={['queued', 'starting', 'running', 'stopping', 'completed', 'failed', 'stopped', 'cancelled'].map((value) => ({ value, label: t(`status.${value}`) }))} />
          </Space>
        </div>
        <AsyncState loading={query.isLoading} error={query.error} empty={!rows.length} onRetry={() => void query.refetch()}>
          <Table<Workload>
            rowKey={(row) => `${row.kind}:${row.id}`}
            dataSource={rows}
            onRow={(row) => ({ onClick: () => navigate(row.detail_url), style: { cursor: 'pointer' } })}
            scroll={{ x: 950 }}
            columns={[
              { title: t('workloads.workload'), dataIndex: 'name', fixed: 'left', render: (value: string, row) => <div><Typography.Text strong>{value}</Typography.Text><small className="table-subtitle">{t(`workloads.kinds.${row.kind}`)}{row.subtype ? ` · ${row.subtype}` : ''}</small></div> },
              { title: t('common.status'), dataIndex: 'status', render: (value: string) => <Tag color={value === 'running' ? 'blue' : value === 'completed' ? 'green' : value === 'failed' ? 'red' : 'default'}>{t(`status.${value}`, { defaultValue: value })}</Tag> },
              { title: t('common.owner'), dataIndex: 'owner_name', render: (value?: string) => value || '—' },
              { title: t('workloads.queue'), render: (_, row) => <div>{t(`workloads.scopes.${row.queue_scope}`)}<small className="table-subtitle">{row.queue_position ? `#${row.queue_position}` : '—'}</small></div> },
              { title: 'GPU', dataIndex: 'gpu_ids', render: (value: number[]) => value.length ? value.map((id) => <Tag key={id}>GPU {id}</Tag>) : '—' },
              { title: t('common.createdAt'), dataIndex: 'created_at', render: (value?: string) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—' },
              { title: t('workloads.error'), dataIndex: 'error', ellipsis: true, render: (value?: string) => value || '—' },
            ]}
          />
        </AsyncState>
      </Card>
    </div>
  );
}
