import { ArrowRightOutlined, CloudServerOutlined, DashboardOutlined, DatabaseOutlined, ExperimentOutlined, PlusOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Progress, Row, Space, Statistic, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, listFrom } from '../api/client';
import type { Experiment } from '../api/types';
import { AsyncState } from '../components/AsyncState';
import { GpuCard } from '../components/GpuCard';
import { PageIntro } from '../components/PageIntro';
import { StatusTag } from '../components/StatusTag';

function formatBytes(value?: number): string {
  if (!value) return '0 GB';
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function boundedPercent(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 15_000 });
  const gpus = useQuery({ queryKey: ['gpus'], queryFn: api.gpus, refetchInterval: 5_000 });
  const storage = dashboard.data?.storage;
  const system = dashboard.data?.system_metrics ?? dashboard.data?.system;
  const storagePercent = storage?.total_bytes ? Math.round((storage.used_bytes / storage.total_bytes) * 100) : 0;
  const cpuPercent = boundedPercent(system?.cpu_percent);
  const memoryPercent = boundedPercent(system?.memory?.percent);
  const recent = dashboard.data?.recent_experiments ?? [];

  return (
    <div className="page">
      <PageIntro
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/experiments/new')}>{t('dashboard.newExperiment')}</Button>}
      />
      <AsyncState loading={dashboard.isLoading} error={dashboard.error} onRetry={() => void dashboard.refetch()}>
        <Row gutter={[16, 16]} className="stat-row">
          <Col xs={12} lg={6}><Card><Statistic title={t('dashboard.running')} value={dashboard.data?.running_jobs ?? 0} prefix={<span className="stat-dot running" />} /></Card></Col>
          <Col xs={12} lg={6}><Card><Statistic title={t('dashboard.queued')} value={dashboard.data?.queued_jobs ?? 0} prefix={<span className="stat-dot queued" />} /></Card></Col>
          <Col xs={12} lg={6}><Card><Statistic title={t('dashboard.completed')} value={dashboard.data?.completed_jobs ?? 0} prefix={<span className="stat-dot completed" />} /></Card></Col>
          <Col xs={12} lg={6}><Card><Statistic title={t('dashboard.failed')} value={dashboard.data?.failed_jobs ?? 0} prefix={<span className="stat-dot failed" />} /></Card></Col>
        </Row>

        <div className="dashboard-grid">
          <Card
            title={<Space><CloudServerOutlined />{t('dashboard.gpuTitle')}</Space>}
            extra={<Button type="text" icon={<ReloadOutlined />} onClick={() => void gpus.refetch()} />}
          >
            <AsyncState loading={gpus.isLoading} error={gpus.error} empty={!listFrom(gpus.data).length} onRetry={() => void gpus.refetch()}>
              <div className="gpu-grid">{listFrom(gpus.data).map((gpu) => <GpuCard key={gpu.id ?? gpu.index} gpu={gpu} />)}</div>
            </AsyncState>
          </Card>
          <div className="dashboard-side">
            <Card title={<Space><DashboardOutlined />{t('dashboard.systemTitle')}</Space>}>
              {system?.available ? (
                <div className="system-metrics">
                  <div className="system-metric">
                    <Progress type="circle" percent={cpuPercent} size={72} strokeColor="#3157d5" />
                    <div className="system-metric-copy">
                      <Typography.Text strong><DashboardOutlined /> {t('dashboard.cpuUsage')}</Typography.Text>
                      {system.load ? (
                        <Typography.Text type="secondary">
                          {t('dashboard.loadAverage')}: {system.load.one_minute.toFixed(2)} / {system.load.five_minutes.toFixed(2)} / {system.load.fifteen_minutes.toFixed(2)}
                        </Typography.Text>
                      ) : null}
                    </div>
                  </div>
                  <div className="system-metric">
                    <Progress type="circle" percent={memoryPercent} size={72} strokeColor="#6f52c7" />
                    <div className="system-metric-copy">
                      <Typography.Text strong><DatabaseOutlined /> {t('dashboard.ramUsage')}</Typography.Text>
                      {system.memory ? (
                        <Typography.Text type="secondary">
                          {formatBytes(system.memory.used_bytes)} / {formatBytes(system.memory.total_bytes)}
                        </Typography.Text>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <Typography.Text type="secondary" title={system?.error?.message}>{t('dashboard.systemUnavailable')}</Typography.Text>
              )}
            </Card>
            <Card title={t('dashboard.storageTitle')}>
              {storage ? (
                <div className="storage-card">
                  <Progress type="dashboard" percent={storagePercent} strokeColor={storage.warning ? '#e5484d' : '#3157d5'} />
                  <div>
                    <Typography.Text strong>{formatBytes(storage.free_bytes)} {t('dashboard.availableSpace')}</Typography.Text>
                    <Typography.Text type="secondary">{storage.path}</Typography.Text>
                    <Typography.Text type="secondary">{formatBytes(storage.used_bytes)} / {formatBytes(storage.total_bytes)}</Typography.Text>
                  </div>
                </div>
              ) : <Typography.Text type="secondary">{t('common.noData')}</Typography.Text>}
            </Card>
            <Card title={<Space><WarningOutlined />{t('dashboard.alerts')}</Space>}>
              <Space direction="vertical" className="full-width">
                {(dashboard.data?.alerts ?? []).map((alert, index) => (
                  <Alert
                    key={alert.id ?? index}
                    type={alert.level}
                    showIcon
                    message={alert.id === 'low_disk_space'
                      ? t('dashboard.lowDiskSpace')
                      : alert.id === 'storage_unavailable' ? t('dashboard.storageUnavailable') : alert.title}
                    description={alert.message}
                  />
                ))}
                {!dashboard.data?.alerts?.length ? <Alert type="success" showIcon message={t('dashboard.operational')} /> : null}
              </Space>
            </Card>
          </div>
        </div>

        <Card
          className="recent-card"
          title={<Space><ExperimentOutlined />{t('dashboard.recent')}</Space>}
          extra={<Button type="link" onClick={() => navigate('/jobs')}>{t('nav.jobs')} <ArrowRightOutlined /></Button>}
        >
          <Table<Experiment>
            rowKey="id"
            dataSource={recent}
            pagination={false}
            onRow={(record) => ({ onClick: () => record.job_id && navigate(`/jobs/${record.job_id}`) })}
            columns={[
              { title: t('builder.experimentName'), dataIndex: 'name', render: (value: string, row) => <div><Typography.Text strong>{value}</Typography.Text><small className="table-subtitle">{row.architecture}</small></div> },
              { title: t('builder.method'), dataIndex: 'method', responsive: ['md'] },
              { title: t('builder.dataset'), dataIndex: 'dataset', responsive: ['lg'] },
              { title: t('common.owner'), dataIndex: 'owner_name', responsive: ['md'] },
              { title: t('common.status'), dataIndex: 'status', render: (value) => <StatusTag status={value} /> },
              { title: t('common.createdAt'), dataIndex: 'created_at', render: (value?: string) => value ? dayjs(value).format('MM-DD HH:mm') : '—', responsive: ['lg'] },
            ]}
          />
        </Card>
      </AsyncState>
    </div>
  );
}
