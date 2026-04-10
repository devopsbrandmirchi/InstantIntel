import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

function getDaysInCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

const CHART_COLORS = [
  'rgb(59, 130, 246)', 'rgb(34, 197, 94)', 'rgb(234, 179, 8)', 'rgb(239, 68, 68)',
  'rgb(168, 85, 247)', 'rgb(236, 72, 153)', 'rgb(20, 184, 166)', 'rgb(249, 115, 22)'
];

const Dashboard = () => {
  const { currentUser } = useAuth();
  const isAdmin = (currentUser?.role || '').toLowerCase() === 'admin';
  const isRestrictedByAssignment = !isAdmin;
  const assignedClientIds = useMemo(
    () => (Array.isArray(currentUser?.assignedClientIds) ? currentUser.assignedClientIds.map(Number).filter(Number.isFinite) : []),
    [currentUser?.assignedClientIds]
  );
  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    totalInventory: 0,
    customersWithInventory: 0,
    totalProcessedSales: 0,
    customersInProcessedSales: 0,
    totalRoles: 0,
    activeUsers: 0
  });
  const [error, setError] = useState(null);
  const [dailyInventoryData, setDailyInventoryData] = useState([]);
  const [dailySalesData, setDailySalesData] = useState([]);
  const [dailySalesByCustomerData, setDailySalesByCustomerData] = useState([]);
  const [clientsMap, setClientsMap] = useState({});
  const [chartError, setChartError] = useState(null);
  const [salesChartError, setSalesChartError] = useState(null);
  const [salesByCustomerChartError, setSalesByCustomerChartError] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inventoryLegendVisible, setInventoryLegendVisible] = useState([]);
  const [salesByCustomerLegendVisible, setSalesByCustomerLegendVisible] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, [currentUser?.id, isRestrictedByAssignment, assignedClientIds.join(',')]);

  useEffect(() => {
    loadChartData();
  }, [currentUser?.id, isRestrictedByAssignment, assignedClientIds.join(',')]);

  useEffect(() => {
    loadSalesChartData();
  }, [currentUser?.id, isRestrictedByAssignment, assignedClientIds.join(',')]);

  useEffect(() => {
    loadSalesByCustomerChartData();
  }, [currentUser?.id, isRestrictedByAssignment, assignedClientIds.join(',')]);

  const loadChartData = async () => {
    setChartError(null);
    try {
      if (isRestrictedByAssignment && assignedClientIds.length === 0) {
        setDailyInventoryData([]);
        setClientsMap({});
        return;
      }
      const [dailyRes, clientsRes] = await Promise.all([
        supabase.rpc('get_daily_inventory_by_customer'),
        (() => {
          let q = supabase.from('clients').select('id, full_name');
          if (isRestrictedByAssignment) q = q.in('id', assignedClientIds);
          return q;
        })()
      ]);
      if (clientsRes.data) {
        setClientsMap(Object.fromEntries((clientsRes.data || []).map((c) => [c.id, c.full_name || `Client #${c.id}`])));
      }
      if (dailyRes.error) throw dailyRes.error;
      const rows = dailyRes.data || [];
      setDailyInventoryData(
        isRestrictedByAssignment ? rows.filter((r) => assignedClientIds.includes(Number(r.customer_id))) : rows
      );
    } catch (err) {
      console.error('Error loading chart data:', err);
      setChartError(err?.message || 'Failed to load chart data.');
      setDailyInventoryData([]);
    }
  };

  const loadSalesChartData = async () => {
    setSalesChartError(null);
    try {
      if (!isRestrictedByAssignment) {
        const { data, error } = await supabase.rpc('get_daily_sales_current_month');
        if (error) throw error;
        setDailySalesData(data || []);
        return;
      }
      if (assignedClientIds.length === 0) {
        setDailySalesData([]);
        return;
      }
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('saleprocessedvins')
        .select('final_sold_date, customer_id')
        .in('customer_id', assignedClientIds)
        .gte('final_sold_date', monthStart)
        .lt('final_sold_date', nextMonthStart);
      if (error) throw error;
      const byDay = {};
      (data || []).forEach((r) => {
        const day = String(r.final_sold_date || '').slice(0, 10);
        if (!day) return;
        byDay[day] = (byDay[day] || 0) + 1;
      });
      const mapped = Object.entries(byDay).map(([day, cnt]) => ({ day, cnt, total_value: 0 }));
      setDailySalesData(mapped);
    } catch (err) {
      console.error('Error loading sales chart data:', err);
      setSalesChartError(err?.message || 'Failed to load sales chart data.');
      setDailySalesData([]);
    }
  };

  const loadSalesByCustomerChartData = async () => {
    setSalesByCustomerChartError(null);
    try {
      if (isRestrictedByAssignment && assignedClientIds.length === 0) {
        setDailySalesByCustomerData([]);
        return;
      }
      const { data, error } = await supabase.rpc('get_daily_sales_by_customer');
      if (error) throw error;
      const rows = data || [];
      setDailySalesByCustomerData(
        isRestrictedByAssignment ? rows.filter((r) => assignedClientIds.includes(Number(r.customer_id))) : rows
      );
    } catch (err) {
      console.error('Error loading sales-by-customer chart data:', err);
      setSalesByCustomerChartError(err?.message || 'Failed to load sales by customer data.');
      setDailySalesByCustomerData([]);
    }
  };

  const loadDashboardData = async (opts = {}) => {
    const showFullPage = opts.showFullPage !== false;
    setError(null);
    if (showFullPage) setDashboardLoading(true);
    try {
      if (isRestrictedByAssignment && assignedClientIds.length === 0) {
        setStats({
          totalClients: 0,
          activeClients: 0,
          totalInventory: 0,
          customersWithInventory: 0,
          totalProcessedSales: 0,
          customersInProcessedSales: 0,
          totalRoles: 0,
          activeUsers: 0
        });
        return;
      }
      if (isRestrictedByAssignment) {
        const [clientsRes, activeClientsRes, inventoryRes, inventoryCustomersRes, processedRes] = await Promise.all([
          supabase.from('clients').select('*', { count: 'exact', head: true }).in('id', assignedClientIds),
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true).in('id', assignedClientIds),
          supabase.from('inventorydata').select('*', { count: 'exact', head: true }).in('customer_id', assignedClientIds),
          supabase.from('inventorydata').select('customer_id').in('customer_id', assignedClientIds),
          supabase.from('saleprocessedvins').select('customer_id', { count: 'exact' }).in('customer_id', assignedClientIds)
        ]);
        const inventoryRows = inventoryCustomersRes.data || [];
        const inventoryCustomers = new Set(inventoryRows.map((r) => Number(r.customer_id)).filter(Number.isFinite));
        const processedRows = processedRes.data || [];
        const processedCustomers = new Set(processedRows.map((r) => Number(r.customer_id)).filter(Number.isFinite));
        setStats({
          totalClients: clientsRes.count ?? 0,
          activeClients: activeClientsRes.count ?? 0,
          totalInventory: inventoryRes.count ?? 0,
          customersWithInventory: inventoryCustomers.size,
          totalProcessedSales: processedRes.count ?? 0,
          customersInProcessedSales: processedCustomers.size,
          totalRoles: 0,
          activeUsers: 0
        });
        return;
      }
      const [clientsRes, activeClientsRes, inventoryRes, customersWithInvRes, processedSummaryRes, rolesRes, profilesRes] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('inventorydata').select('*', { count: 'exact', head: true }),
        supabase.rpc('get_inventory_customer_count'),
        supabase.rpc('get_saleprocessedvins_summary'),
        supabase.from('roles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true })
      ]);

      const processed = (processedSummaryRes.data && processedSummaryRes.data[0]) || {};
      const totalProcessed = Math.max(0, Number(processed.total_rows) || 0);
      const customersProcessed = Math.max(0, Number(processed.customer_count) || 0);
      setStats({
        totalClients: clientsRes.count ?? 0,
        activeClients: activeClientsRes.count ?? 0,
        totalInventory: inventoryRes.count ?? 0,
        customersWithInventory: (customersWithInvRes.error ? 0 : (customersWithInvRes.data ?? 0)),
        totalProcessedSales: totalProcessed,
        customersInProcessedSales: customersProcessed,
        totalRoles: rolesRes.count ?? 0,
        activeUsers: profilesRes.count ?? 0
      });
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err?.message || 'Failed to load dashboard data.');
    } finally {
      if (showFullPage) setDashboardLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadDashboardData({ showFullPage: false }),
        loadChartData(),
        loadSalesChartData(),
        loadSalesByCustomerChartData()
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const monthLabels = useMemo(() => getDaysInCurrentMonth(), []);
  const chartDataBase = useMemo(() => {
    const byCustomer = {};
    dailyInventoryData.forEach((row) => {
      const day = typeof row.day === 'string' ? row.day : row.day?.toISOString?.()?.slice(0, 10);
      if (!day) return;
      const cid = row.customer_id;
      if (!byCustomer[cid]) byCustomer[cid] = {};
      byCustomer[cid][day] = Number(row.cnt) || 0;
    });
    const labels = monthLabels;
    const datasets = Object.keys(byCustomer)
      .map(Number)
      .sort((a, b) => a - b)
      .map((customerId, i) => ({
        label: clientsMap[customerId] ?? `Customer ${customerId}`,
        data: labels.map((day) => byCustomer[customerId]?.[day] ?? 0),
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        backgroundColor: CHART_COLORS[i % CHART_COLORS.length].replace('rgb', 'rgba').replace(')', ', 0.1)'),
        fill: true,
        tension: 0.2
      }))
      .filter((d) => d.data.some((v) => v > 0) || Object.keys(clientsMap).length === 0);
    return { labels, datasets };
  }, [dailyInventoryData, clientsMap, monthLabels]);

  useEffect(() => {
    const n = chartDataBase.datasets.length;
    if (n === 0) return;
    setInventoryLegendVisible((prev) => (prev.length === n ? prev : Array.from({ length: n }, (_, i) => i === 0)));
  }, [chartDataBase.datasets.length]);

  const chartData = useMemo(() => ({
    ...chartDataBase,
    datasets: chartDataBase.datasets.map((d, i) => ({
      ...d,
      hidden: !(inventoryLegendVisible[i] ?? i === 0)
    }))
  }), [chartDataBase, inventoryLegendVisible]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: `Daily inventory count by customer — ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}` }
    },
    scales: {
      x: { title: { display: true, text: 'Day' } },
      y: { beginAtZero: true, title: { display: true, text: 'Inventory count' } }
    }
  }), []);

  const salesChartData = useMemo(() => {
    const byDay = {};
    dailySalesData.forEach((row) => {
      const day = typeof row.day === 'string' ? row.day : row.day?.toISOString?.()?.slice(0, 10);
      if (!day) return;
      byDay[day] = { cnt: Number(row.cnt) || 0, total_value: Number(row.total_value) || 0 };
    });
    const labels = monthLabels;
    return {
      labels,
      datasets: [
        {
          label: 'Sales (units)',
          data: labels.map((day) => byDay[day]?.cnt ?? 0),
          borderColor: 'rgb(249, 115, 22)',
          backgroundColor: 'rgba(249, 115, 22, 0.12)',
          fill: true,
          tension: 0.2,
          yAxisID: 'y'
        },
        {
          label: 'Sales value ($)',
          data: labels.map((day) => byDay[day]?.total_value ?? 0),
          borderColor: 'rgb(20, 184, 166)',
          backgroundColor: 'rgba(20, 184, 166, 0.12)',
          fill: true,
          tension: 0.2,
          yAxisID: 'y1'
        }
      ]
    };
  }, [dailySalesData, monthLabels]);

  const salesChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: `Daily sales — ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}` },
      tooltip: {
        callbacks: {
          label(context) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label.includes('value')) return `${label}: $${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            return `${label}: ${value}`;
          }
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'Day' } },
      y: {
        type: 'linear',
        position: 'left',
        beginAtZero: true,
        title: { display: true, text: 'Units sold' }
      },
      y1: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        title: { display: true, text: 'Value ($)' },
        grid: { drawOnChartArea: false }
      }
    }
  }), []);

  const salesByCustomerChartDataBase = useMemo(() => {
    const byCustomer = {};
    dailySalesByCustomerData.forEach((row) => {
      const day = typeof row.day === 'string' ? row.day : row.day?.toISOString?.()?.slice(0, 10);
      if (!day) return;
      const cid = row.customer_id;
      if (!byCustomer[cid]) byCustomer[cid] = {};
      byCustomer[cid][day] = Number(row.cnt) || 0;
    });
    const labels = monthLabels;
    const datasets = Object.keys(byCustomer)
      .map(Number)
      .sort((a, b) => a - b)
      .map((customerId, i) => ({
        label: clientsMap[customerId] ?? `Customer ${customerId}`,
        data: labels.map((day) => byCustomer[customerId]?.[day] ?? 0),
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        backgroundColor: CHART_COLORS[i % CHART_COLORS.length].replace('rgb', 'rgba').replace(')', ', 0.1)'),
        fill: true,
        tension: 0.2
      }));
    return { labels, datasets };
  }, [dailySalesByCustomerData, clientsMap, monthLabels]);

  useEffect(() => {
    const n = salesByCustomerChartDataBase.datasets.length;
    if (n === 0) return;
    setSalesByCustomerLegendVisible((prev) => (prev.length === n ? prev : Array.from({ length: n }, (_, i) => i === 0)));
  }, [salesByCustomerChartDataBase.datasets.length]);

  const salesByCustomerChartData = useMemo(() => ({
    ...salesByCustomerChartDataBase,
    datasets: salesByCustomerChartDataBase.datasets.map((d, i) => ({
      ...d,
      hidden: !(salesByCustomerLegendVisible[i] ?? i === 0)
    }))
  }), [salesByCustomerChartDataBase, salesByCustomerLegendVisible]);

  const salesByCustomerChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: `Daily sales by customer — ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}` }
    },
    scales: {
      x: { title: { display: true, text: 'Day' } },
      y: { beginAtZero: true, title: { display: true, text: 'Sales (units)' } }
    }
  }), []);

  if (dashboardLoading) {
    return (
      <div className="page-content text-xs flex flex-col items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3 text-gray-600">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-brand-mint" aria-hidden="true" />
          <p className="text-sm font-medium">Loading dashboard…</p>
          <p className="text-xs text-gray-500">Please wait while we fetch your data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content text-xs">
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-3 py-2 text-sm rounded-md bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <i className={`fas ${refreshing ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} aria-hidden />
          Refresh
        </button>
      </div>
      {error && (
        <div className="mb-3 p-2 rounded bg-red-50 text-red-700 text-xs">
          {error}
        </div>
      )}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-3'}`}
      >
        <div className="bg-white p-3 rounded shadow-md">
          <div className="flex items-center">
            <div className="p-2 rounded-full bg-brand-mint/25 text-brand-teal">
              <i className="fas fa-users text-sm"></i>
            </div>
            <div className="ml-3">
              <p className="text-gray-600 text-xs">Clients</p>
              <p className="text-lg font-bold text-gray-800">
                {stats.activeClients} <span className="font-normal text-gray-500">/ {stats.totalClients}</span>
              </p>
              <p className="text-gray-500 text-[10px] mt-0.5">active of total</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-3 rounded shadow-md">
          <div className="flex items-center">
            <div className="p-2 rounded-full bg-green-100 text-green-600">
              <i className="fas fa-boxes text-sm"></i>
            </div>
            <div className="ml-3">
              <p className="text-gray-600 text-xs">Total Inventory</p>
              <p className="text-lg font-bold text-gray-800">{stats.totalInventory}</p>
              <p className="text-gray-500 text-[10px] mt-0.5">from {stats.customersWithInventory} customer{stats.customersWithInventory !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-3 rounded shadow-md">
          <div className="flex items-center">
            <div className="p-2 rounded-full bg-teal-100 text-teal-600">
              <i className="fas fa-file-invoice text-sm"></i>
            </div>
            <div className="ml-3">
              <p className="text-gray-600 text-xs">Processed Sales</p>
              <p className="text-lg font-bold text-gray-800">{(Number(stats.totalProcessedSales) || 0).toLocaleString()}</p>
              <p className="text-gray-500 text-[10px] mt-0.5">from {Number(stats.customersInProcessedSales) || 0} customer{(Number(stats.customersInProcessedSales) || 0) !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <>
            <div className="bg-white p-3 rounded shadow-md">
              <div className="flex items-center">
                <div className="p-2 rounded-full bg-yellow-100 text-yellow-600">
                  <i className="fas fa-user-tag text-sm"></i>
                </div>
                <div className="ml-3">
                  <p className="text-gray-600 text-xs">Total Roles</p>
                  <p className="text-lg font-bold text-gray-800">{stats.totalRoles}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-3 rounded shadow-md">
              <div className="flex items-center">
                <div className="p-2 rounded-full bg-purple-100 text-purple-600">
                  <i className="fas fa-chart-line text-sm"></i>
                </div>
                <div className="ml-3">
                  <p className="text-gray-600 text-xs">Active Users</p>
                  <p className="text-lg font-bold text-gray-800">{stats.activeUsers}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="bg-white p-4 rounded shadow-md mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">This month — day-to-day inventory by customer</h2>
        {chartError && (
          <div className="mb-3 p-2 rounded bg-amber-50 text-amber-800 text-xs">
            {chartError} (Run migration <code>get_daily_inventory_by_customer.sql</code> if needed.)
          </div>
        )}
        {!chartError && chartData.datasets.length === 0 && (
          <p className="text-gray-500 text-xs">No inventory data for this month yet.</p>
        )}
        {!chartError && chartData.datasets.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3" role="group" aria-label="Toggle customer series">
              {chartData.datasets.map((ds, i) => (
                <label key={ds.label} className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={inventoryLegendVisible[i] ?? i === 0}
                    onChange={() => {
                      setInventoryLegendVisible((prev) => {
                        const next = [...(prev.length ? prev : Array.from({ length: chartData.datasets.length }, (_, j) => j === 0))];
                        next[i] = !(next[i] ?? i === 0);
                        return next;
                      });
                    }}
                    className="rounded border-gray-400 text-brand-teal focus:ring-brand-teal/60"
                  />
                  <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: ds.borderColor }} aria-hidden />
                  <span>{ds.label}</span>
                </label>
              ))}
            </div>
            <div className="h-64 sm:h-80">
              <Line data={chartData} options={chartOptions} />
            </div>
          </>
        )}
      </div>

      <div className="bg-white p-4 rounded shadow-md mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">This month — sales by customer</h2>
        {salesByCustomerChartError && (
          <div className="mb-3 p-2 rounded bg-amber-50 text-amber-800 text-xs">
            {salesByCustomerChartError} (Run migration <code>get_daily_sales_by_customer.sql</code> if needed.)
          </div>
        )}
        {!salesByCustomerChartError && salesByCustomerChartData.datasets.length === 0 && (
          <p className="text-gray-500 text-xs">No sales by customer for this month yet.</p>
        )}
        {!salesByCustomerChartError && salesByCustomerChartData.datasets.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3" role="group" aria-label="Toggle customer series">
              {salesByCustomerChartData.datasets.map((ds, i) => (
                <label key={ds.label} className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={salesByCustomerLegendVisible[i] ?? i === 0}
                    onChange={() => {
                      setSalesByCustomerLegendVisible((prev) => {
                        const next = [...(prev.length ? prev : Array.from({ length: salesByCustomerChartData.datasets.length }, (_, j) => j === 0))];
                        next[i] = !(next[i] ?? i === 0);
                        return next;
                      });
                    }}
                    className="rounded border-gray-400 text-brand-teal focus:ring-brand-teal/60"
                  />
                  <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: ds.borderColor }} aria-hidden />
                  <span>{ds.label}</span>
                </label>
              ))}
            </div>
            <div className="h-64 sm:h-80">
              <Line data={salesByCustomerChartData} options={salesByCustomerChartOptions} />
            </div>
          </>
        )}
      </div>

      <div className="bg-white p-4 rounded shadow-md mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">This month — daily sales</h2>
        {salesChartError && (
          <div className="mb-3 p-2 rounded bg-amber-50 text-amber-800 text-xs">
            {salesChartError} (Run migration <code>get_daily_sales_current_month.sql</code> if needed.)
          </div>
        )}
        {!salesChartError && dailySalesData.length === 0 && (
          <p className="text-gray-500 text-xs">No sales data for this month yet.</p>
        )}
        {!salesChartError && dailySalesData.length > 0 && (
          <div className="h-64 sm:h-80">
            <Line data={salesChartData} options={salesChartOptions} />
          </div>
        )}
      </div>

      </div>
  );
};

export default Dashboard;

