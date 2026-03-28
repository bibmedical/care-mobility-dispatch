import LogoBox from '@/components/LogoBox';
import React, { Suspense } from 'react';
import AppMenu from './components/AppMenu';
import { getMenuItems } from '@/helpers/menu';
import FallbackLoading from '@/components/FallbackLoading';
import Image from 'next/image';
import partyImg from '@/assets/images/extra/party.gif';
import SimplebarReactClient from '@/components/wrappers/SimplebarReactClient';
const LeftSideBar = () => {
  const menuItems = getMenuItems();
  return <div className="startbar d-print-none">
      <div className="brand">
        <LogoBox />
      </div>
      <div className="startbar-menu">
        <SimplebarReactClient className="startbar-collapse" id="startbarCollapse" data-simplebar>
          <div className="d-flex align-items-start flex-column w-100">
            <Suspense fallback={<FallbackLoading />}>
              <AppMenu menuItems={menuItems} />
            </Suspense>
            <div className="update-msg text-center">
              <div className="d-flex justify-content-center align-items-center thumb-lg update-icon-box  rounded-circle mx-auto">
                <Image src={partyImg} alt='partyImg' className="d-inline-block me-1" height={30} />
              </div>
              <h5 className="mt-3">Dispatch Center</h5>
              <p className="mb-3 text-muted">Acceso rapido a viajes, choferes, pasajeros y cargas CSV.</p>
              <a href="/forms-safe-ride-import" className="btn bg-black text-white shadow-sm rounded-pill">Import CSV</a>
            </div>
          </div>
        </SimplebarReactClient>
      </div>
    </div>;
};
export default LeftSideBar;