import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      tenantCompanyId?: string;
    }
  }
}

/**
 * Enforces strict multi-tenant data isolation.
 * For Company Admins and Employees, locks the request context to their assigned companyId.
 * Rejects any request attempting to access or mutate another company's data.
 */
export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  // Super Admins can operate across tenants
  if (req.user.role === 'super_admin') {
    const targetCompanyId =
      (req.params.companyId as string) ||
      (req.query.companyId as string) ||
      (req.headers['x-company-id'] as string) ||
      req.body.companyId;

    if (targetCompanyId) {
      req.tenantCompanyId = targetCompanyId;
    }
    return next();
  }

  // For tenant users, companyId is required
  if (!req.user.companyId) {
    res.status(403).json({ error: 'Tenant context missing. User is not assigned to a company.' });
    return;
  }

  // Verify that any explicit company parameter matches the user's company
  const explicitCompanyId =
    (req.params.companyId as string) ||
    (req.query.companyId as string) ||
    (req.headers['x-company-id'] as string) ||
    (req.body && req.body.companyId);

  if (explicitCompanyId && explicitCompanyId !== req.user.companyId) {
    res.status(403).json({
      error: 'Cross-tenant access violation: You are not authorized to view or modify data for another company.',
    });
    return;
  }

  // Always force tenant scope to user's company
  req.tenantCompanyId = req.user.companyId;
  next();
}
