import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';

// Admin Menu Structure with Sub-Navlinks / Dropdown Accordions
const ADMIN_MENU_ITEMS = [
  { type: 'link', to: '/dashboard', label: 'Dashboard' },
  { type: 'link', to: '/team', label: 'Team' },
  { type: 'link', to: '/crm', label: 'WhatsApp CRM' },
  { type: 'link', to: '/payments', label: 'Subscriptions' },
  {
    type: 'group',
    id: 'mla',
    label: 'MLA',
    children: [
      { to: '/mla-list', label: 'MLA List' },
      { to: '/mla-images', label: 'MLA Images' },
    ],
  },
  {
    type: 'group',
    id: 'logins',
    label: 'Logins',
    children: [
      { to: '/assemblies', label: 'Assembly Login' },
      { to: '/booth-logins', label: 'Booth Wise Login' },
      { to: '/registrations', label: 'Registrations' },
      { to: '/ward-logins', label: 'Ward Logins' },
    ],
  },
  {
    type: 'group',
    id: 'data',
    label: 'Data',
    children: [
      { to: '/assembly-analytics', label: 'Assembly Details' },
      { to: '/booths', label: 'Booth List' },
      { to: '/voters', label: 'Voters List' },
    ],
  },
  { type: 'link', to: '/flow-images', label: 'Flow Images' },
];

const OTHER_MENUS = {
  3: [
    ['/assembly-details', 'Assembly Details'],
    ['/voters', 'Voters List'],
    ['/booth-report', 'Booth Report'],
    ['/candidate-briefing', 'Candidate Briefing'],
    ['/field-operations', 'Field Operations'],
  ],
  4: [
    ['/booth/dashboard', 'Dashboard'],
    ['/voters', 'Voters List'],
    ['/performance-report', 'Performance Report'],
    ['/ward/social-media', 'Social Media Request'],
    ['/ward/social-media-reports', 'Social Media Reports'],
  ],
  12: [
    ['/team/dashboard', 'Dashboard'],
    ['/crm', 'WhatsApp CRM'],
    ['/team/reports', 'Reports'],
  ],
};
OTHER_MENUS[11] = OTHER_MENUS[4];

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user } = useAuth();
  const location = useLocation();
  const groupId = Number(user?.group_id || 1);
  const [wardInfo, setWardInfo] = useState({ isSample: true });

  // State to manage expanded dropdown groups for Admin (closed by default)
  const [openGroups, setOpenGroups] = useState({});

  // Auto-expand active route group
  useEffect(() => {
    const currentPath = location.pathname;
    ADMIN_MENU_ITEMS.forEach((item) => {
      if (item.type === 'group' && item.children) {
        if (item.children.some((c) => c.to === currentPath)) {
          setOpenGroups((prev) => ({ ...prev, [item.id]: true }));
        }
      }
    });
  }, [location.pathname]);

  useEffect(() => {
    if (groupId === 6) {
      api.get('/ward/home')
        .then(({ data }) => {
          if (data.success) {
            setWardInfo(data);
          }
        })
        .catch(() => {});
    }
  }, [groupId]);

  const toggleGroup = (id) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (groupId === 6) {
    const wardLinks = wardInfo.isSample
      ? [
          ['/ward/dashboard', 'Home'],
          ['/ward/dashboard#sample', 'Sample Data'],
          ['/voters', 'Voter List 🔒', null, true],
          ['/ward/social-media', 'Social Media'],
          ['/ward/social-media-reports', 'Social Media Reports'],
        ]
      : [
          ['/ward/dashboard', 'Home'],
          ['/voters', 'Voter List'],
          ['/ward/social-media', 'Social Media'],
          ['/ward/social-media-reports', 'Social Media Reports'],
        ];

    return (
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center' }}>
          <img src="/EDM.png" alt="EDM Logo" style={{ maxHeight: 64, maxWidth: '100%', objectFit: 'contain' }} />
        </div>
        <nav>
          {wardLinks.map(([to, label, realTo, isLocked]) => (
            <NavLink
              key={to}
              to={realTo || to}
              onClick={onClose}
              className={({ isActive }) => `${isActive ? 'active' : ''}${isLocked ? ' locked-link' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
    );
  }

  // Non-admin roles (3, 4, 11, 12)
  if (groupId !== 1 && OTHER_MENUS[groupId]) {
    const simpleLinks = OTHER_MENUS[groupId];
    return (
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center' }}>
          <img src="/EDM.png" alt="EDM Logo" style={{ maxHeight: 64, maxWidth: '100%', objectFit: 'contain' }} />
        </div>
        <nav>
          {simpleLinks.map(([to, label, realTo, isLocked]) => (
            <NavLink
              key={to}
              to={realTo || to}
              onClick={onClose}
              className={({ isActive }) => `${isActive ? 'active' : ''}${isLocked ? ' locked-link' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
    );
  }

  // Group 1 (Super Admin) Structured Accordion Menu
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="brand" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center' }}>
        <img src="/EDM.png" alt="EDM Logo" style={{ maxHeight: 64, maxWidth: '100%', objectFit: 'contain' }} />
      </div>
      <nav style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ADMIN_MENU_ITEMS.map((item) => {
          if (item.type === 'link') {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {item.label}
              </NavLink>
            );
          }

          if (item.type === 'group') {
            const isOpen = !!openGroups[item.id];
            const hasActiveChild = item.children.some((c) => c.to === location.pathname);

            return (
              <div key={item.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '10px 14px',
                    color: hasActiveChild ? '#0071e3' : '#474747',
                    fontSize: '14px',
                    fontWeight: hasActiveChild ? 600 : 500,
                    background: hasActiveChild ? 'rgba(0, 113, 227, 0.06)' : 'transparent',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  <span>{item.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      color: hasActiveChild ? '#0071e3' : '#707070',
                      transition: 'transform 0.2s ease',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  >
                    ▶
                  </span>
                </button>

                {isOpen && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      paddingLeft: 12,
                      marginTop: 4,
                      marginBottom: 4,
                      borderLeft: '2px solid #e8e8ed',
                      marginLeft: 14,
                    }}
                  >
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        onClick={onClose}
                        className={({ isActive }) => (isActive ? 'active' : '')}
                        style={{
                          padding: '8px 12px',
                          fontSize: '13.5px',
                          borderRadius: '8px',
                        }}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}
      </nav>
    </aside>
  );
}
