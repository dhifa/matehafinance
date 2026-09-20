import { ProjectBudget } from "../types";

export interface BudgetCalculations {
  totalIncome: number; // Total A
  totalAccommodation: number; // Total B
  netIncome: number; // Net Income = Total A - Total B
  matehaShare: number; // Section C - Mateha (e.g. 25% of Net)
  staffPool: number; // Section C - Staff Fees pool (e.g. 70% of Net)
  investorShare: number; // Section C - Investor (e.g. 5% of Net)
  picBonus: number; // PIC Bonus (e.g. 5% of Staff Fees pool)
  feeDistributionItemSum: number; // sum of staff fees in D except PIC bonus
  totalFeeDistribution: number; // Total D = feeDistributionItemSum + picBonus
  leftoverStaffPool: number; // staffPool - Total D
  matehaProfit: number; // matehaShare + leftoverStaffPool
}

export function calculateProjectBudget(budget: ProjectBudget): BudgetCalculations {
  const rawSharing = budget?.sharingRatio;
  const safeSharingRatio = {
    mateha: (rawSharing && rawSharing.mateha !== undefined && rawSharing.mateha !== null) ? Number(rawSharing.mateha) : 25,
    staff: (rawSharing && rawSharing.staff !== undefined && rawSharing.staff !== null) ? Number(rawSharing.staff) : 70,
    investor: (rawSharing && rawSharing.investor !== undefined && rawSharing.investor !== null) ? Number(rawSharing.investor) : 5,
  };

  const safeBudget = {
    income: budget?.income || [],
    accommodation: budget?.accommodation || [],
    sharingRatio: safeSharingRatio,
    feeDistribution: budget?.feeDistribution || [],
    picBonusRatio: budget?.picBonusRatio !== undefined ? budget?.picBonusRatio : 5
  };

  // A. Income
  const totalIncome = safeBudget.income.reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.expense) || 0)), 0);

  // B. Accommodation and other costs
  const totalAccommodation = safeBudget.accommodation.reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.expense) || 0)), 0);

  // Net Income (Section C base)
  const netIncome = Math.max(0, totalIncome - totalAccommodation); // Guard against negative revenue, but generally A - B

  // C. Income Sharing
  const sharState = safeBudget.sharingRatio;
  const matehaShare = netIncome * ((Number(sharState.mateha) || 0) / 100);
  const staffPool = netIncome * ((Number(sharState.staff) || 0) / 100);
  const investorShare = netIncome * ((Number(sharState.investor) || 0) / 100);

  // D. Details of Fee Distribution
  const picBonusRatio = safeBudget.picBonusRatio;
  const picBonus = staffPool * ((Number(picBonusRatio) || 0) / 100);

  const feeDistributionItemSum = safeBudget.feeDistribution.reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.expense) || 0)), 0);
  const totalFeeDistribution = feeDistributionItemSum + picBonus;

  const leftoverStaffPool = staffPool - totalFeeDistribution;

  // Bottom Line: Total Mateha's Profit
  // Total Mateha Profit = Company Share + leftover staff pool (unallocated staff pool is retained by Mateha)
  const matehaProfit = matehaShare + leftoverStaffPool;

  return {
    totalIncome,
    totalAccommodation,
    netIncome,
    matehaShare,
    staffPool,
    investorShare,
    picBonus,
    feeDistributionItemSum,
    totalFeeDistribution,
    leftoverStaffPool,
    matehaProfit
  };
}
