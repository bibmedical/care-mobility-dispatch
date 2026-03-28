import Image from 'next/image';
import { Dropdown, DropdownDivider, DropdownItem, DropdownMenu, DropdownToggle } from 'react-bootstrap';
import avatar1 from '@/assets/images/users/avatar-1.jpg';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
const ProfileDropdown = () => {
  return <Dropdown as={'li'} className="topbar-item">
      <DropdownToggle as={'a'} className="nav-link arrow-none nav-icon" role="button" aria-haspopup="false" aria-expanded="false">
        <Image width={36} height={36} src={avatar1} alt="user" className="thumb-md rounded-circle" />
      </DropdownToggle>
      <DropdownMenu align={'end'} className="py-0 mt-3">
        <div className="d-flex align-items-center dropdown-item py-2 bg-secondary-subtle">
          <div className="flex-shrink-0">
            <Image src={avatar1} alt="avatar" className="thumb-md rounded-circle" />
          </div>
          <div className="flex-grow-1 ms-2 text-truncate align-self-center">
              <h6 className="my-0 fw-medium text-dark fs-13">Administrador</h6>
              <small className="text-muted mb-0">Cuenta local</small>
          </div>
        </div>
        <DropdownDivider className="mt-0" />
          <small className="text-muted px-2 pb-1 d-block">Cuenta</small>
          <DropdownItem href="/administrators">
            <IconifyIcon icon="la:user" className="fs-18 me-1 align-text-bottom" /> Perfil
        </DropdownItem>
          <DropdownItem href="/dispatcher">
            <IconifyIcon icon="la:wallet" className="fs-18 me-1 align-text-bottom" /> Centro de ayuda
        </DropdownItem>
          <small className="text-muted px-2 py-1 d-block">Configuracion</small>
          <DropdownItem href="/administrators">
          <IconifyIcon icon="la:cog" className="fs-18 me-1 align-text-bottom" />
            Ajustes de cuenta
        </DropdownItem>
          <DropdownItem href="/administrators">
            <IconifyIcon icon="la:lock" className="fs-18 me-1 align-text-bottom" /> Seguridad
        </DropdownItem>
          <DropdownItem href="/dispatcher">
            <IconifyIcon icon="la:question-circle" className="fs-18 me-1 align-text-bottom" /> Soporte
        </DropdownItem>
        <DropdownDivider className="mb-0" />
        <DropdownItem className="text-danger" href="/auth/login">
            <IconifyIcon icon="la:power-off" className="fs-18 me-1 align-text-bottom" /> Salir
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>;
};
export default ProfileDropdown;