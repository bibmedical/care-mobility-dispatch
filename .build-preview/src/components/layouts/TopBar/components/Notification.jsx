'use client';

import SimplebarReactClient from '@/components/wrappers/SimplebarReactClient';
import React from 'react';
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle, Nav, NavItem, NavLink, TabContainer, TabContent, TabPane } from 'react-bootstrap';
const Notification = () => {
  return <Dropdown as={'li'} className="topbar-item">
      <DropdownToggle as={'a'} className="nav-link arrow-none nav-icon" data-bs-toggle="dropdown" href="#" role="button" aria-haspopup="false" aria-expanded="false" data-bs-offset="0,19">
        <i className="iconoir-bell" />
        <span className="alert-badge" />
      </DropdownToggle>
      <DropdownMenu className="stop dropdown-menu-end dropdown-lg py-0 mt-3">
        <h5 className="dropdown-item-text m-0 py-3 d-flex justify-content-between align-items-center">
          Notifications <a href="#" className="badge text-body-tertiary badge-pill">
            <i className="iconoir-plus-circle fs-4" />
          </a>
        </h5>
        <TabContainer defaultActiveKey={'All'}>
          <Nav className="nav-tabs nav-tabs-custom nav-success nav-justified mb-1" role="tablist">
            <NavItem role="presentation">
              <NavLink eventKey='All' className="mx-0" data-bs-toggle="tab" href="#All" role="tab" aria-selected="true">
                All <span className="badge bg-primary-subtle text-primary badge-pill ms-1">24</span>
              </NavLink>
            </NavItem>
            <NavItem role="presentation">
              <NavLink eventKey='Projects' className="mx-0" data-bs-toggle="tab" href="#Projects" role="tab" aria-selected="false" tabIndex={-1}>
                Projects
              </NavLink>
            </NavItem>
            <NavItem role="presentation">
              <NavLink eventKey='Teams' className="mx-0" data-bs-toggle="tab" href="#Teams" role="tab" aria-selected="false" tabIndex={-1}>
                Team
              </NavLink>
            </NavItem>
          </Nav>
          <SimplebarReactClient className="ms-0" style={{
          maxHeight: 230
        }} data-simplebar>
            <TabContent id="myTabContent">
              <TabPane eventKey='All' className="fade" id="All" role="tabpanel" aria-labelledby="all-tab" tabIndex={0}>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">2 min ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-wolf fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">Your order is placed</h6>
                      <small className="text-muted mb-0">Dummy text of the printing and industry.</small>
                    </div>
                  </div>
                </DropdownItem>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">10 min ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-apple-swift fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">Meeting with designers</h6>
                      <small className="text-muted mb-0">It is a long established fact that a reader.</small>
                    </div>
                  </div>
                </DropdownItem>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">40 min ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-birthday-cake fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">UX 3 Task complete.</h6>
                      <small className="text-muted mb-0">Dummy text of the printing.</small>
                    </div>
                  </div>
                </DropdownItem>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">1 hr ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-drone fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">Your order is placed</h6>
                      <small className="text-muted mb-0">It is a long established fact that a reader.</small>
                    </div>
                  </div>
                </DropdownItem>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">2 hrs ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-user fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">Payment Successfull</h6>
                      <small className="text-muted mb-0">Dummy text of the printing.</small>
                    </div>
                  </div>
                </DropdownItem>
              </TabPane>
              <TabPane eventKey='Projects' className="fade" id="Projects" role="tabpanel" aria-labelledby="projects-tab" tabIndex={0}>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">40 min ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-birthday-cake fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">UX 3 Task complete.</h6>
                      <small className="text-muted mb-0">Dummy text of the printing.</small>
                    </div>
                  </div>
                </DropdownItem>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">1 hr ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-drone fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">Your order is placed</h6>
                      <small className="text-muted mb-0">It is a long established fact that a reader.</small>
                    </div>
                  </div>
                </DropdownItem>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">2 hrs ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-user fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">Payment Successfull</h6>
                      <small className="text-muted mb-0">Dummy text of the printing.</small>
                    </div>
                  </div>
                </DropdownItem>
              </TabPane>
              <TabPane eventKey='Teams' className="fade" id="Teams" role="tabpanel" aria-labelledby="teams-tab" tabIndex={0}>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">1 hr ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-drone fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">Your order is placed</h6>
                      <small className="text-muted mb-0">It is a long established fact that a reader.</small>
                    </div>
                  </div>
                </DropdownItem>
                <DropdownItem className="py-3">
                  <small className="float-end text-muted ps-2">2 hrs ago</small>
                  <div className="d-flex align-items-center">
                    <div className="flex-shrink-0 bg-primary-subtle text-primary thumb-md rounded-circle">
                      <i className="iconoir-user fs-4" />
                    </div>
                    <div className="flex-grow-1 ms-2 text-truncate">
                      <h6 className="my-0 fw-normal text-dark fs-13">Payment Successfull</h6>
                      <small className="text-muted mb-0">Dummy text of the printing.</small>
                    </div>
                  </div>
                </DropdownItem>
              </TabPane>
            </TabContent>
          </SimplebarReactClient>
        </TabContainer>
        <a href="pages-notifications.html" className="dropdown-item text-center text-dark fs-13 py-2">
          View All <i className="fi-arrow-right" />
        </a>
      </DropdownMenu>
    </Dropdown>;
};
export default Notification;