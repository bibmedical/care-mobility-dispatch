'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Collapse } from 'react-bootstrap';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { findAllParent, findMenuItem, getMenuItemFromURL } from '@/helpers/menu';

const mergeUniqueKeys = keys => Array.from(new Set((keys || []).filter(Boolean)));

const areKeyListsEqual = (left, right) => {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((key, index) => key === right[index]);
};

const MenuItemWithChildren = ({
  item,
  className,
  linkClassName,
  subMenuClassName,
  expandedMenuItems,
  activeMenuItems,
  toggleMenu
}) => {
  const open = expandedMenuItems.includes(item.key);

  const toggleMenuItem = e => {
    e.preventDefault();
    if (toggleMenu) toggleMenu(item, !open);
    return false;
  };

  const getActiveClass = item => {
    return activeMenuItems?.includes(item.key) ? 'active' : '';
  };

  return <li className={className}>
      <div onClick={toggleMenuItem} aria-expanded={open} data-bs-toggle="collapse" className={linkClassName} role="button">
        {item.icon && <i className="menu-icon">
            <IconifyIcon icon={item.icon} />
          </i>}
        <span>{item.label}</span>
        {item.badge && <span className={`badge rounded text-${item.badge.variant} ms-1 bg-${item.badge.variant}-subtle`}>{item.badge.text}</span>}
        {/* <IconifyIcon icon="la:angle-right" className="menu-arrow" /> */}
      </div>
      <Collapse in={open}>
        <div>
          <ul className={subMenuClassName}>
            {(item.children || []).map((child, idx) => {
            return <Fragment key={child.key + idx}>
                  {child.children ? <MenuItemWithChildren item={child} linkClassName={clsx('nav-link', getActiveClass(child))} expandedMenuItems={expandedMenuItems} activeMenuItems={activeMenuItems} className="nav-item" subMenuClassName="nav flex-column" toggleMenu={toggleMenu} /> : <MenuItem item={child} className="nav-item" linkClassName={clsx('nav-link', getActiveClass(child))} />}
                </Fragment>;
          })}
          </ul>
        </div>
      </Collapse>
    </li>;
};
const MenuItem = ({
  item,
  className,
  linkClassName
}) => {
  return <li className={className}>
      <MenuItemLink item={item} className={linkClassName} />
    </li>;
};
const MenuItemLink = ({
  item,
  className
}) => {
  const { data: session } = useSession();

  const handleLogoff = async event => {
    event.preventDefault();

    try {
      if (session?.user?.id) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            userId: session.user.id,
            authSessionId: session.user.authSessionId
          })
        });
      }
    } catch (error) {
      console.error('Error in logout logging:', error);
    }

    await signOut({ redirect: false });
    if (typeof window !== 'undefined') {
      window.location.assign('/auth/login');
    }
  };

  if (item.key === 'logoff') {
    return <button type="button" onClick={handleLogoff} className={clsx(className, 'w-100 text-start border-0 bg-transparent', {
      disabled: item.isDisabled
    })}>
        {item.icon && <i className="menu-icon">
            <IconifyIcon icon={item.icon} />
          </i>}
        <span>{item.label}</span>
        {item.badge && <span className={`badge badge-pill text-end bg-${item.badge.variant}`}>{item.badge.text}</span>}
      </button>;
  }

  return <Link href={item.url ?? ''} target={item.target} className={clsx(className, {
    disabled: item.isDisabled
  })}>
      {item.icon && <i className="menu-icon">
          <IconifyIcon icon={item.icon} />
        </i>}
      <span>{item.label}</span>
      {item.badge && <span className={`badge badge-pill text-end bg-${item.badge.variant}`}>{item.badge.text}</span>}
    </Link>;
};
const AppMenu = ({
  menuItems
}) => {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [activeMenuItems, setActiveMenuItems] = useState([]);
  const [expandedMenuItems, setExpandedMenuItems] = useState([]);
  const currentUserId = String(session?.user?.id || '').trim();
  const visibleMenuItems = useMemo(() => {
    const isAllowed = item => {
      const allowedUserIds = Array.isArray(item?.allowedUserIds) ? item.allowedUserIds.map(value => String(value || '').trim()).filter(Boolean) : [];
      if (allowedUserIds.length === 0) return true;
      // Avoid locking the whole sidebar while the session is still resolving.
      if (!currentUserId) return true;
      return allowedUserIds.includes(currentUserId);
    };

    const filterItems = items => {
      return (items || []).reduce((acc, item) => {
        if (item?.isTitle) {
          acc.push(item);
          return acc;
        }

        if (!isAllowed(item)) {
          return acc;
        }

        if (Array.isArray(item?.children) && item.children.length > 0) {
          const children = filterItems(item.children);
          if (children.length === 0) {
            return acc;
          }
          acc.push({ ...item,
            children
          });
          return acc;
        }

        acc.push(item);
        return acc;
      }, []);
    };

    return filterItems(menuItems || []);
  }, [menuItems, currentUserId]);

  const toggleMenu = (menuItem, show) => {
    const nextKeys = [menuItem.key, ...findAllParent(visibleMenuItems, menuItem)];
    setExpandedMenuItems(current => {
      if (show) {
        const mergedKeys = mergeUniqueKeys([...current, ...nextKeys]);
        return areKeyListsEqual(current, mergedKeys) ? current : mergedKeys;
      }

      const filteredKeys = current.filter(key => key !== menuItem.key);
      return areKeyListsEqual(current, filteredKeys) ? current : filteredKeys;
    });
  };

  const getActiveClass = item => {
    return activeMenuItems?.includes(item.key) ? 'active' : '';
  };

  useEffect(() => {
    if (!visibleMenuItems || visibleMenuItems.length === 0) return;

    const currentPath = pathname || '';
    const matchingMenuItem = getMenuItemFromURL(visibleMenuItems, currentPath);

    if (!matchingMenuItem) {
      setActiveMenuItems(current => current.length === 0 ? current : []);
      return;
    }

    const activeItem = findMenuItem(visibleMenuItems, matchingMenuItem.key);
    if (!activeItem) return;

    const nextActiveKeys = mergeUniqueKeys([activeItem.key, ...findAllParent(visibleMenuItems, activeItem)]);

    setActiveMenuItems(current => areKeyListsEqual(current, nextActiveKeys) ? current : nextActiveKeys);
    setExpandedMenuItems(current => {
      const nextExpandedKeys = mergeUniqueKeys([...current, ...nextActiveKeys]);
      return areKeyListsEqual(current, nextExpandedKeys) ? current : nextExpandedKeys;
    });

    const scrollTimer = window.setTimeout(() => {
      const activatedItem = document.querySelector(`#startbarCollapse .simplebar-content a[href="${currentPath}"]`);
      const sidebarContainer = document.querySelector('#startbarCollapse .simplebar-content-wrapper');
      if (!(activatedItem instanceof HTMLElement) || !(sidebarContainer instanceof HTMLElement)) return;

      const offset = Math.max(0, activatedItem.offsetTop - sidebarContainer.clientHeight * 0.4);
      sidebarContainer.scrollTop = offset;
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [pathname, visibleMenuItems]);

  return <ul className="navbar-nav mb-auto w-100">
      {(visibleMenuItems || []).map((item, idx) => {
      return <Fragment key={item.key + idx}>
            {item.isTitle ? <li className={clsx('menu-label', 'mt-2')}>
                <small className={clsx({
            'label-border': idx != 0
          })}>
                  <div className="border_left hidden-xs" />
                  <div className="border_right" />
                </small>
                <span>{item.label}</span>
              </li> : <>
                {item.children ? <MenuItemWithChildren item={item} toggleMenu={toggleMenu} className={clsx('nav-item', getActiveClass(item))} linkClassName={clsx('nav-link', getActiveClass(item))} subMenuClassName="nav flex-column" expandedMenuItems={expandedMenuItems} activeMenuItems={activeMenuItems} /> : <MenuItem item={item} linkClassName={clsx('nav-link', getActiveClass(item))} className={clsx('nav-item', getActiveClass(item))} />}
              </>}
          </Fragment>;
    })}
    </ul>;
};
export default AppMenu;