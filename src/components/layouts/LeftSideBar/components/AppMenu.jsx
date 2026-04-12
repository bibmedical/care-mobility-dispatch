'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Collapse } from 'react-bootstrap';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { findAllParent, findMenuItem, getMenuItemFromURL } from '@/helpers/menu';
const MenuItemWithChildren = ({
  item,
  className,
  linkClassName,
  subMenuClassName,
  activeMenuItems,
  toggleMenu
}) => {
  const [open, setOpen] = useState(activeMenuItems.includes(item.key));
  useEffect(() => {
    setOpen(activeMenuItems.includes(item.key));
  }, [activeMenuItems, item]);
  const toggleMenuItem = e => {
    e.preventDefault();
    const status = !open;
    setOpen(status);
    if (toggleMenu) toggleMenu(item, status);
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
                  {child.children ? <MenuItemWithChildren item={child} linkClassName={clsx('nav-link', getActiveClass(child))} activeMenuItems={activeMenuItems} className="nav-item" subMenuClassName="nav flex-column" toggleMenu={toggleMenu} /> : <MenuItem item={child} className="nav-item" linkClassName={clsx('nav-link', getActiveClass(child))} />}
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
        void fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            userId: session.user.id,
            authSessionId: session.user.authSessionId
          })
        }).catch(error => console.error('Failed to log logout:', error));
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
    if (show) setActiveMenuItems([menuItem.key, ...findAllParent(visibleMenuItems, menuItem)]);
  };
  const getActiveClass = item => {
    return activeMenuItems?.includes(item.key) ? 'active' : '';
  };
  const activeMenu = useCallback(() => {
    const trimmedURL = pathname?.replaceAll('', '');
    const matchingMenuItem = getMenuItemFromURL(visibleMenuItems, trimmedURL);
    if (matchingMenuItem) {
      const activeMt = findMenuItem(visibleMenuItems, matchingMenuItem.key);
      if (activeMt) {
        setActiveMenuItems([activeMt.key, ...findAllParent(visibleMenuItems, activeMt)]);
      }
      setTimeout(() => {
        const activatedItem = document.querySelector(`#leftside-menu-container .simplebar-content a[href="${trimmedURL}"]`);
        if (activatedItem) {
          const simplebarContent = document.querySelector('#leftside-menu-container .simplebar-content-wrapper');
          if (simplebarContent) {
            const offset = activatedItem.offsetTop - window.innerHeight * 0.4;
            scrollTo(simplebarContent, offset, 600);
          }
        }
      }, 400);

      // scrollTo (Left Side Bar Active Menu)
      const easeInOutQuad = (t, b, c, d) => {
        t /= d / 2;
        if (t < 1) return c / 2 * t * t + b;
        t--;
        return -c / 2 * (t * (t - 2) - 1) + b;
      };
      const scrollTo = (element, to, duration) => {
        const start = element.scrollTop,
          change = to - start,
          increment = 20;
        let currentTime = 0;
        const animateScroll = function () {
          currentTime += increment;
          const val = easeInOutQuad(currentTime, start, change, duration);
          element.scrollTop = val;
          if (currentTime < duration) {
            setTimeout(animateScroll, increment);
          }
        };
        animateScroll();
      };
    }
  }, [pathname, visibleMenuItems]);
  useEffect(() => {
    if (visibleMenuItems && visibleMenuItems.length > 0) activeMenu();
  }, [activeMenu, visibleMenuItems]);
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
                {item.children ? <MenuItemWithChildren item={item} toggleMenu={toggleMenu} className={clsx('nav-item', getActiveClass(item))} linkClassName={clsx('nav-link', getActiveClass(item))} subMenuClassName="nav flex-column" activeMenuItems={activeMenuItems} /> : <MenuItem item={item} linkClassName={clsx('nav-link', getActiveClass(item))} className={clsx('nav-item', getActiveClass(item))} />}
              </>}
          </Fragment>;
    })}
    </ul>;
};
export default AppMenu;