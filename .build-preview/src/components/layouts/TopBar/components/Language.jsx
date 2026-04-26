import Image from 'next/image';
import React from 'react';
import us_flag from '@/assets/images/flags/us_flag.jpg';
import spain_flag from '@/assets/images/flags/spain_flag.jpg';
import germany_flag from '@/assets/images/flags/germany_flag.jpg';
import french_flag from '@/assets/images/flags/french_flag.jpg';
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle } from 'react-bootstrap';
const Language = () => {
  return <Dropdown as={'li'} className='topbar-item' drop='down'>
      <DropdownToggle as={'a'} className="nav-link nav-icon" data-bs-toggle="dropdown" href="#" role="button" aria-haspopup="false" aria-expanded="false" data-bs-offset="0,19">
        <Image src={us_flag} alt='us_flag' className="thumb-sm rounded-circle" />
      </DropdownToggle>
      <DropdownMenu className='mt-3'>
        <DropdownItem><Image src={us_flag} alt="us_flag" height={15} className="me-2" />English</DropdownItem>
        <DropdownItem><Image src={spain_flag} alt="spain_flag" height={15} className="me-2" />Spanish</DropdownItem>
        <DropdownItem><Image src={germany_flag} alt="germany_flag" height={15} className="me-2" />German</DropdownItem>
        <DropdownItem><Image src={french_flag} alt="french_flag" height={15} className="me-2" />French</DropdownItem>
      </DropdownMenu>
    </Dropdown>;
};
export default Language;